
const domainInput = document.getElementById("domain");
const extensionSelect = document.getElementById("extension");
const statusBox = document.getElementById("status");
const methodBox = document.getElementById("method");

let timer;
let requestId = 0;

// These extensions are configured for DNS-only checking.
// Other listed extensions will attempt an RDAP lookup after DNS is negative.
const dnsOnlyExtensions = new Set(["it"]);

function showStatus(message, type = "muted") {
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

function updateMethod() {
  const extension = extensionSelect.value;

  if (dnsOnlyExtensions.has(extension)) {
    methodBox.textContent =
      "DNS Check Only — RDAP is not enabled for this extension.";
  } else {
    methodBox.textContent =
      "DNS first, then RDAP if no DNS records are found.";
  }
}

function getDomain() {
  const name = domainInput.value.trim().toLowerCase();
  const extension = extensionSelect.value.toLowerCase();

  if (!name) return null;

  // Allow users to enter either "example" or "example.com".
  const cleanName = name.replace(/\.$/, "");
  const domain = cleanName.includes(".")
    ? cleanName
    : `${cleanName}.${extension}`;

  const labels = domain.split(".");
  const validLabel =
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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
  const types = ["A", "AAAA", "NS", "MX", "CNAME"];

  const results = await Promise.allSettled(
    types.map(async type => {
      const url = new URL("https://cloudflare-dns.com/dns-query");
      url.searchParams.set("name", domain);
      url.searchParams.set("type", type);

      const response = await fetch(url, {
        headers: { Accept: "application/dns-json" }
      });

      if (!response.ok) {
        throw new Error("DNS service unavailable");
      }

      return response.json();
    })
  );

  const hasRecords = results.some(result =>
    result.status === "fulfilled" &&
    Array.isArray(result.value.Answer) &&
    result.value.Answer.length > 0
  );

  const allFailed = results.every(
    result => result.status === "rejected"
  );

  return { hasRecords, allFailed };
}

async function checkRdap(domain) {
  const response = await fetch(
    `https://rdap.org/domain/${encodeURIComponent(domain)}`,
    {
      headers: {
        Accept: "application/rdap+json, application/json"
      }
    }
  );

  if (response.status === 404) {
    return "not-found";
  }

  if (!response.ok) {
    return "error";
  }

  const data = await response.json();

  if (data.objectClassName === "domain" || data.ldhName) {
    return "registered";
  }

  return "error";
}

async function checkDomain(domain, id) {
  showStatus(`Checking DNS for ${domain}...`);

  try {
    const dns = await checkDns(domain);

    if (id !== requestId) return;

    if (dns.allFailed) {
      showStatus(
        "Unable to check DNS right now. Please try again later.",
        "muted"
      );
      return;
    }

    // DNS positive: do not make an RDAP request.
    if (dns.hasRecords) {
      showStatus(
        "DNS records found — likely in use. Registration and availability are not conclusively confirmed.",
        "warn"
      );
      return;
    }

    // DNS negative and extension is DNS-only.
    const extension = domain.split(".").pop();

    if (dnsOnlyExtensions.has(extension)) {
      showStatus(
        "No common DNS records found. DNS Check Only — availability is NOT confirmed.",
        "warn"
      );
      return;
    }

    // DNS negative: attempt RDAP lookup.
    showStatus(
      "No DNS records found. Checking RDAP registration...",
      "muted"
    );

    const rdapResult = await checkRdap(domain);

    if (id !== requestId) return;

    if (rdapResult === "registered") {
      showStatus(
        "Registered — an RDAP domain record was found.",
        "bad"
      );
    } else if (rdapResult === "not-found") {
      showStatus(
        "No DNS records or RDAP record found. Availability is NOT confirmed; check a registrar.",
        "warn"
      );
    } else {
      showStatus(
        "RDAP could not verify this domain. Availability is unconfirmed.",
        "muted"
      );
    }
  } catch (error) {
    if (id !== requestId) return;

    console.error("Domain check error:", error);
    showStatus(
      "Unable to verify right now. A lookup service may be unavailable or blocked.",
      "muted"
    );
  }
}

function handleInput() {
  clearTimeout(timer);
  const id = ++requestId;
  const domain = getDomain();

  updateMethod();

  if (!domain) {
    showStatus("Enter a valid domain name.");
    return;
  }

  showStatus("Waiting...");
  timer = setTimeout(() => checkDomain(domain, id), 500);
}

domainInput.addEventListener("input", handleInput);
extensionSelect.addEventListener("change", handleInput);

updateMethod();
