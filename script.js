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
  const validLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (
    labels.length < 2 ||
    labels.some(label => !validLabel.test(label)) ||
    domain.length > 253
  ) {
    return null;
  }

  return domain;
}

async function checkDns(domain) {
  // DNS-over-HTTPS is a corroborating signal only; it cannot prove availability.
  const types = ["A", "AAAA", "NS", "MX", "CNAME"];
  const results = await Promise.allSettled(
    types.map(async type => {
      const url = new URL("https://cloudflare-dns.com/dns-query");
      url.searchParams.set("name", domain);
      url.searchParams.set("type", type);

      const response = await fetch(url, {
        headers: { Accept: "application/dns-json" }
      });

      if (!response.ok) throw new Error(`DNS check failed (${response.status})`);
      return response.json();
    })
  );

  const answersFound = results.some(result =>
    result.status === "fulfilled" &&
    Array.isArray(result.value.Answer) &&
    result.value.Answer.length > 0
  );

  const allFailed = results.every(result => result.status === "rejected");
  return { answersFound, allFailed };
}

async function checkDomain(domain, id) {
  showStatus(`Checking ${domain}...`);

  try {
    const rdapResponse = await fetch(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      { headers: { Accept: "application/rdap+json, application/json" } }
    );

    if (id !== requestId) return;

    if (rdapResponse.ok) {
      const data = await rdapResponse.json();

      if (id !== requestId) return;

      if (data.objectClassName === "domain" || data.ldhName) {
        showStatus("Registered — an RDAP domain record was found.", "bad");
        return;
      }

      showStatus("Unable to verify: unexpected RDAP response.", "muted");
      return;
    }

    if (rdapResponse.status !== 404) {
      showStatus(
        `Unable to verify registration (RDAP returned ${rdapResponse.status}). Try again or check a registrar.`,
        "muted"
      );
      return;
    }

    // RDAP returned 404. Check DNS too, but neither result alone proves availability.
    const dns = await checkDns(domain);

    if (id !== requestId) return;

    if (dns.answersFound) {
      showStatus(
        "DNS records found, but RDAP returned no record. Status is uncertain — check with a registrar.",
        "warn"
      );
    } else if (dns.allFailed) {
      showStatus(
        "RDAP found no record, but DNS could not be checked. Availability is unconfirmed.",
        "warn"
      );
    } else {
      showStatus(
        "No RDAP record or common DNS records found. This does NOT confirm availability — check with a registrar.",
        "warn"
      );
    }
  } catch (error) {
    if (id !== requestId) return;
    console.error("Domain check error:", error);
    showStatus(
      "Unable to verify right now. The lookup service may be unavailable or blocked. Try again later.",
      "muted"
    );
  }
}

function handleInput() {
  clearTimeout(timer);
  const id = ++requestId;
  const domain = normalizeDomain();

  if (!domain) {
    showStatus("Enter a valid domain name and extension.");
    return;
  }

  showStatus("Waiting...");
  timer = setTimeout(() => checkDomain(domain, id), 500);
}

domainInput.addEventListener("input", handleInput);
extensionInput.addEventListener("input", handleInput);
