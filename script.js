
const domainInput = document.getElementById("domain");
const extensionInput = document.getElementById("extension");
const statusBox = document.getElementById("status");
const previewSection = document.getElementById("preview-section");
const preview = document.getElementById("preview");
const openSite = document.getElementById("open-site");

let timer;
let requestId = 0;

function showStatus(message, type = "muted") {
  statusBox.className = `status ${type}`;
  statusBox.replaceChildren();

  const line = document.createElement("div");
  line.textContent = message;
  statusBox.appendChild(line);
}

function normalizeDomain() {
  const name = domainInput.value.trim();
  let extension = extensionInput.value.trim();

  if (!name || !extension) return null;

  extension = extension.replace(/^\.+/, "");

  if (
    !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(name) ||
    !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(extension) ||
    name.startsWith("-") ||
    name.endsWith("-")
  ) {
    return null;
  }

  const fullDomain = `${name}.${extension}`.toLowerCase();

  if (fullDomain.length > 253) return null;

  return fullDomain;
}

function renderDomainStatus(domain, registered, site) {
  statusBox.replaceChildren();
  statusBox.className = "status";

  const domainLine = document.createElement("div");
  domainLine.textContent =
    `Domain ${registered ? "✅" : "❌"}`;

  const siteLine = document.createElement("div");
  siteLine.textContent =
    `Site ${site === true ? "✅" :
      site === false ? "❌" : "— Not verified"}`;

  statusBox.append(domainLine, siteLine);
}

async function checkDomain(domain, id) {
  showStatus("Checking domain and website...");

  try {
    // Public RDAP lookup. A 404 generally means
    // the domain is not registered.
    const response = await fetch(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`
    );

    if (id !== requestId) return;

    if (response.status === 404) {
      renderDomainStatus(domain, false, null);
      previewSection.hidden = true;
      preview.removeAttribute("src");
      openSite.hidden = true;
      return;
    }

    if (!response.ok) {
      throw new Error("Domain status could not be verified.");
    }

    renderDomainStatus(domain, true, null);

    const url = `https://${domain}/`;

    openSite.href = url;
    openSite.hidden = false;
    previewSection.hidden = false;
    preview.src = url;

    // Check website metadata using an external service.
    // This is an indication, not a guarantee of uptime.
    try {
      const api =
        "https://api.microlink.io/?url=" +
        encodeURIComponent(url);

      const siteResponse = await fetch(api);

      if (!siteResponse.ok) {
        throw new Error("Site status unknown");
      }

      const data = await siteResponse.json();

      if (id !== requestId) return;

      const siteAvailable = data.status === "success";

      renderDomainStatus(domain, true, siteAvailable);
    } catch {
      if (id !== requestId) return;
      renderDomainStatus(domain, true, null);
    }
  } catch {
    if (id !== requestId) return;
    showStatus(
      "Unable to verify right now. Please try again.",
      "bad"
    );
  }
}

function handleInput() {
  clearTimeout(timer);
  const id = ++requestId;
  const domain = normalizeDomain();

  if (!domain) {
    showStatus("Enter a valid domain and extension.");
    previewSection.hidden = true;
    preview.removeAttribute("src");
    openSite.hidden = true;
    return;
  }

  showStatus("Waiting for input...");
  timer = setTimeout(() => checkDomain(domain, id), 500);
}

domainInput.addEventListener("input", handleInput);
extensionInput.addEventListener("input", handleInput);
