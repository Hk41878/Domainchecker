
(() => {
  const domainInput = document.getElementById("domain");
  const extensionSelect = document.getElementById("extension");
  const characterSelector = document.getElementById("character-selector");
  const scanButton = document.getElementById("scan-button");
  const progressBox = document.getElementById("scan-progress");
  const resultsBox = document.getElementById("scan-results");

  if (
    !domainInput ||
    !extensionSelect ||
    !characterSelector ||
    !scanButton ||
    !progressBox ||
    !resultsBox
  ) {
    console.error("Domain scanner: required HTML elements are missing.");
    return;
  }

  const CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789";
  const DNS_ONLY_EXTENSIONS = new Set(["it"]);

  let selectedIndex = -1;
  let scanning = false;
  let scanRunId = 0;

  function getBaseName() {
    const input = domainInput.value.trim().toLowerCase();

    if (!input) return "";

    // If a full domain was entered, remove the selected extension.
    const selectedSuffix = `.${extensionSelect.value.toLowerCase()}`;

    if (input.endsWith(selectedSuffix)) {
      return input.slice(0, -selectedSuffix.length);
    }

    // Also support entering a different full domain.
    if (input.includes(".")) {
      return input.split(".")[0];
    }

    return input;
  }

  function isValidName(name) {
    return (
      name.length > 0 &&
      name.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)
    );
  }

  function renderCharacterButtons() {
    const name = getBaseName();
    characterSelector.replaceChildren();
    selectedIndex = -1;

    if (!name) {
      const hint = document.createElement("p");
      hint.className = "selector-hint";
      hint.textContent = "Enter a domain name to select a character.";
      characterSelector.appendChild(hint);
      scanButton.disabled = true;
      return;
    }

    [...name].forEach((character, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "char-button";
      button.textContent = character;
      button.setAttribute("aria-label", `Select character ${character} at position ${index + 1}`);
      button.setAttribute("aria-pressed", "false");

      button.addEventListener("click", () => {
        if (scanning) return;

        selectedIndex = index;

        characterSelector
          .querySelectorAll(".char-button")
          .forEach((item, itemIndex) => {
            const selected = itemIndex === index;
            item.classList.toggle("selected", selected);
            item.setAttribute("aria-pressed", String(selected));
          });

        scanButton.disabled = false;
        progressBox.textContent =
          `Selected position ${index + 1}. ${CHARACTERS.length} combinations will be checked.`;
      });

      characterSelector.appendChild(button);
    });

    scanButton.disabled = true;
    progressBox.textContent = "Select one character to replace.";
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
          throw new Error("DNS lookup failed");
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

    if (response.status === 404) return "not-found";
    if (!response.ok) return "error";

    const data = await response.json();

    if (data.objectClassName === "domain" || data.ldhName) {
      return "registered";
    }

    return "error";
  }

  async function getDomainEmoji(domain) {
    try {
      const dns = await checkDns(domain);

      if (dns.allFailed) return "⚪";

      // DNS records found: red symbol, matching the main checker.
      if (dns.hasRecords) return "❌";

      const extension = domain.split(".").pop();

      // .IT uses DNS-only checks.
      if (DNS_ONLY_EXTENSIONS.has(extension)) {
        return "🟡";
      }

      // No DNS records: try RDAP.
      const rdap = await checkRdap(domain);

      if (rdap === "registered") return "❌";
      if (rdap === "not-found") return "🍀";

      return "⚪";
    } catch {
      return "⚪";
    }
  }

  function addResult(domain, emoji) {
    const row = document.createElement("div");
    row.className = "scan-result-row";

    const domainText = document.createElement("span");
    domainText.className = "scan-result-domain";
    domainText.textContent = domain;

    const icon = document.createElement("span");
    icon.className = "scan-result-emoji";
    icon.textContent = emoji;
    icon.setAttribute("aria-label", emoji);

    row.append(domainText, icon);
    resultsBox.appendChild(row);
  }

  async function startScan() {
    if (scanning) return;

    const name = getBaseName();
    const extension = extensionSelect.value.toLowerCase();

    if (!isValidName(name)) {
      progressBox.textContent = "Enter a valid domain name first.";
      return;
    }

    if (selectedIndex < 0 || selectedIndex >= name.length) {
      progressBox.textContent = "Select one character to replace.";
      return;
    }

    scanning = true;
    scanButton.disabled = true;
    domainInput.disabled = true;
    extensionSelect.disabled = true;
    scanRunId += 1;

    const currentRun = scanRunId;
    let completed = 0;

    resultsBox.replaceChildren();
    progressBox.textContent = `Starting scan: 0/${CHARACTERS.length}`;

    try {
      for (const character of CHARACTERS) {
        if (currentRun !== scanRunId) return;

        const variant =
          name.slice(0, selectedIndex) +
          character +
          name.slice(selectedIndex + 1);

        const domain = `${variant}.${extension}`;
        const emoji = await getDomainEmoji(domain);

        if (currentRun !== scanRunId) return;

        addResult(domain, emoji);

        completed += 1;
        progressBox.textContent =
          `Checking ${completed}/${CHARACTERS.length} — ${domain}`;

        // Small pause between checks to reduce bursts of requests.
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      progressBox.textContent =
        `Scan complete: ${completed}/${CHARACTERS.length} domains checked.`;
    } finally {
      scanning = false;
      domainInput.disabled = false;
      extensionSelect.disabled = false;
      scanButton.disabled = selectedIndex < 0;
    }
  }

  domainInput.addEventListener("input", () => {
    if (scanning) return;
    resultsBox.replaceChildren();
    renderCharacterButtons();
  });

  extensionSelect.addEventListener("change", () => {
    if (scanning) return;
    resultsBox.replaceChildren();
    renderCharacterButtons();
  });

  scanButton.addEventListener("click", startScan);

  renderCharacterButtons();
})();
