
const domainInput = document.getElementById("domain");
const extensionInput = document.getElementById("extension");
const statusBox = document.getElementById("status");

let timer;
let requestId = 0;
let bootstrapPromise;

function showStatus(message, type = "muted") {
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

function getDomain() {
  const name = domainInput.value.trim().toLowerCase();
  const extension = extensionInput.value
    .trim()
    .replace(/^\.+/, "")
    .toLowerCase();

  if (!name || !extension) return null;

  const labels = `${name}.${extension}`.split(".");
  const validLabel =
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (
    labels.some(label => !validLabel.test(label)) ||
    labels.join(".").length > 253
  ) {
    return null;
  }

  return labels.join(".");
}

async function getRdapServer(tld) {
  if (!bootstrapPromise) {
    bootstrapPromise = fetch("https://data.iana.org/rdap/dns.json")
      .then(response => {
        if (!response.ok) throw new Error("Registry list unavailable");
        return response.json();
      });
  }

  const data = await bootstrapPromise;

  const service = data.services.find(
    item => item[0].some(t => t.toLowerCase() === tld)
  );

  if (!service || !service[1]?.length) {
    throw new Error("This extension is not supported by RDAP");
  }

  return service[1][0].replace(/\/+$/, "");
}

async function checkDomain(domain, id) {
  showStatus("Checking domain registration...");

  try {
    const tld = domain.split(".").pop();
    const server = await getRdapServer(tld);

    if (id !== requestId) return;

    const response = await fetch(
      `${server}/domain/${encodeURIComponent(domain)}`
    );

    if (id !== requestId) return;

    if (response.status === 404) {
      showStatus(
        "🟢 Likely available — confirm with a registrar.",
        "ok"
      );
      return;
    }

    if (!response.ok) {
      throw new Error("Registry could not confirm the status");
    }

    const data = await response.json();

    if (data.objectClassName !== "domain") {
      throw new Error("Unexpected registry response");
    }

    showStatus("✅ Domain registered.", "bad");
  } catch (error) {
    if (id !== requestId) return;

    showStatus(
      "⚠️ Unable to verify. Try again later or check a registrar.",
      "muted"
    );
  }
}

function handleInput() {
  clearTimeout(timer);
  const id = ++requestId;
  const domain = getDomain();

  if (!domain) {
    showStatus("Enter a valid domain and extension.");
    return;
  }

  showStatus("Waiting...");
  timer = setTimeout(() => checkDomain(domain, id), 500);
}

domainInput.addEventListener("input", handleInput);
extensionInput.addEventListener("input", handleInput);
