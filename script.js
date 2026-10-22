
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
    .trim().replace(/^\.+/, "").toLowerCase();

  if (!name || !extension) return null;

  const labels = `${name}.${extension}`.split(".");
  const validLabel =
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (labels.some(label => !validLabel.test(label))) return null;
  if (labels.join(".").length > 253) return null;

  return labels.join(".");
}

async function getRdapServer(tld) {
  if (!bootstrapPromise) {
    bootstrapPromise = fetch("https://data.iana.org/rdap/dns.json")
      .then(response => {
        if (!response.ok) {
          throw new Error(`Registry list HTTP ${response.status}`);
        }
        return response.json();
      });
  }

  const data = await bootstrapPromise;
  const service = data.services.find(
    item => item[0].some(value => value.toLowerCase() === tld)
  );

  if (!service || !service[1]?.length) {
    throw new Error(`No RDAP registry found for .${tld}`);
  }

  return service[1][0].replace(/\/+$/, "");
}

async function checkDomain(domain, id) {
  showStatus("Checking domain...");

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
        "🟢 Domain not found in registry. Check registrar to confirm availability.",
        "ok"
      );
      return;
    }

    if (!response.ok) {
      throw new Error(`Registry HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.objectClassName !== "domain") {
      throw new Error("Unexpected registry response");
    }

    showStatus("✅ Domain is registered.", "bad");
  } catch (error) {
    if (id !== requestId) return;

    console.error("Domain check error:", error);

    showStatus(
      `Unable to verify: ${error.message}. Try again later.`,
      "bad"
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
