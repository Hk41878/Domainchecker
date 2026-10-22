
const domainInput = document.getElementById("domain");
const extensionInput = document.getElementById("extension");
const statusBox = document.getElementById("status");

let timer;
let requestId = 0;

function showStatus(message, type = "muted") {
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

function normalizeDomain() {
  const name = domainInput.value.trim().toLowerCase();
  const extension = extensionInput.value
    .trim()
    .replace(/^\.+/, "")
    .toLowerCase();

  if (!name || !extension) return null;

  const domain = `${name}.${extension}`;
  const labels = domain.split(".");
  const validLabel =
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (
    labels.some(label => !validLabel.test(label)) ||
    domain.length > 253
  ) {
    return null;
  }

  return domain;
}

async function checkDomain(domain, id) {
  showStatus("Checking domain registration...");

  try {
    const response = await fetch(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`
    );

    if (id !== requestId) return;

    if (response.status === 404) {
      showStatus(
        "🟢 Domain not found. Confirm availability with a registrar.",
        "ok"
      );
      return;
    }

    if (!response.ok) {
      throw new Error(`RDAP request failed (${response.status})`);
    }

    const data = await response.json();

    if (id !== requestId) return;

    if (data.objectClassName !== "domain") {
      throw new Error("Unexpected response from registry");
    }

    showStatus("✅ Domain is registered.", "bad");

  } catch (error) {
    if (id !== requestId) return;

    console.error("Domain check error:", error);

    showStatus(
      `Unable to verify: ${error.message}`,
      "muted"
    );
  }
}

function handleInput() {
  clearTimeout(timer);
  const id = ++requestId;
  const domain = normalizeDomain();

  if (!domain) {
    showStatus("Enter a valid domain and extension.");
    return;
  }

  showStatus("Waiting...");
  timer = setTimeout(() => checkDomain(domain, id), 500);
}

domainInput.addEventListener("input", handleInput);
extensionInput.addEventListener("input", handleInput);
