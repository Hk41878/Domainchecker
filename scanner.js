
(() => {
  const domainInput = document.getElementById("domain");
  const extensionSelect = document.getElementById("extension");
  const characterSelector = document.getElementById("character-selector");
  const scanButton = document.getElementById("scan-button");
  const progressBox = document.getElementById("scan-progress");
  const resultsBox = document.getElementById("scan-results");
  const includeLetters = document.getElementById("include-letters");
  const includeNumbers = document.getElementById("include-numbers");
  const sortButtons = [...document.querySelectorAll(".sort-button")];
  const infoButton = document.getElementById("sort-info-button");
  const infoBox = document.getElementById("sort-info");

  const LETTERS = "abcdefghijklmnopqrstuvwxyz";
  const NUMBERS = "0123456789";
  const DNS_ONLY_EXTENSIONS = new Set(["it"]);

  let selectedPositions = new Set();
  let sortEmoji = null;
  let scanning = false;

  function getBaseName() {
    const input = domainInput.value.trim().toLowerCase();
    if (!input) return "";

    const suffix = `.${extensionSelect.value.toLowerCase()}`;

    if (input.endsWith(suffix)) {
      return input.slice(0, -suffix.length);
    }

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

  function getCharacters() {
    let characters = "";

    if (includeLetters.checked) characters += LETTERS;
    if (includeNumbers.checked) characters += NUMBERS;

    return characters;
  }

  function getCombinationCount() {
    const positions = selectedPositions.size;
    const characters = getCharacters().length;

    if (!positions || !characters) return 0;

    return characters ** positions;
  }

  function updateScanButton() {
    const count = getCombinationCount();
    scanButton.textContent = `Auto Check ${count}`;

    scanButton.disabled =
      scanning ||
      count === 0 ||
      !isValidName(getBaseName());
  }

  function renderCharacterButtons() {
    const name = getBaseName();
    characterSelector.replaceChildren();

    // Remove selections that no longer exist.
    selectedPositions = new Set(
      [...selectedPositions].filter(index => index < name.length)
    );

    if (!name) {
      const hint = document.createElement("p");
      hint.className = "selector-hint";
      hint.textContent = "Enter a domain name to select characters.";
      characterSelector.appendChild(hint);
      updateScanButton();
      return;
    }

    [...name].forEach((character, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "char-button";
      button.textContent = character;
      button.setAttribute(
        "aria-label",
        `Select character ${character} at position ${index + 1}`
      );

      function updateButton() {
        const selected = selectedPositions.has(index);
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      }

      button.addEventListener("click", () => {
        if (scanning) return;

        if (selectedPositions.has(index)) {
          selectedPositions.delete(index);
        } else {
          selectedPositions.add(index);
        }

        updateButton();
        updateScanButton();

        const count = getCombinationCount();

        progressBox.textContent = count
          ? `${selectedPositions.size} position(s) selected. ${count} combinations will be checked.`
          : "Select character positions and a character set.";
      });

      updateButton();
      characterSelector.appendChild(button);
    });

    updateScanButton();
    progressBox.textContent = "Select one or more character positions.";
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

        if (!response.ok) throw new Error("DNS lookup failed");

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
      if (dns.hasRecords) return "❌";

      const extension = domain.split(".").pop();

      if (DNS_ONLY_EXTENSIONS.has(extension)) {
        return "🟡";
      }

      const rdap = await checkRdap(domain);

      if (rdap === "registered") return "❌";
      if (rdap === "not-found") return "🍀";

      return "⚪";
    } catch {
      return "⚪";
    }
  }

  function sortResults() {
    const rows = [...resultsBox.querySelectorAll(".scan-result-row")];

    rows.sort((a, b) => {
      if (!sortEmoji) {
        return Number(a.dataset.index) - Number(b.dataset.index);
      }

      const aMatch = a.dataset.emoji === sortEmoji;
      const bMatch = b.dataset.emoji === sortEmoji;

      if (aMatch !== bMatch) return aMatch ? -1 : 1;

      // Keep original order within each group.
      return Number(a.dataset.index) - Number(b.dataset.index);
    });

    rows.forEach(row => resultsBox.appendChild(row));
  }

  function addResult(domain, emoji, index) {
    const row = document.createElement("div");
    row.className = "scan-result-row";
    row.dataset.emoji = emoji;
    row.dataset.index = String(index);

    const domainText = document.createElement("span");
    domainText.className = "scan-result-domain";
    domainText.textContent = domain;

    const icon = document.createElement("span");
    icon.className = "scan-result-emoji";
    icon.textContent = emoji;
    icon.setAttribute("aria-label", emoji);

    row.append(domainText, icon);
    resultsBox.appendChild(row);

    if (sortEmoji) sortResults();
  }

  function* generateVariants(name, positions, characters) {
    const chars = [...name];

    function* build(depth) {
      if (depth === positions.length) {
        yield chars.join("");
        return;
      }

      const position = positions[depth];
      const original = chars[position];

      for (const character of characters) {
        chars[position] = character;
        yield* build(depth + 1);
      }

      chars[position] = original;
    }

    yield* build(0);
  }

  async function startScan() {
    if (scanning) return;

    const name = getBaseName();
    const extension = extensionSelect.value.toLowerCase();
    const characters = getCharacters();
    const positions = [...selectedPositions].sort((a, b) => a - b);

    if (!isValidName(name)) {
      progressBox.textContent = "Enter a valid domain name first.";
      return;
    }

    if (!positions.length || !characters.length) {
      progressBox.textContent =
        "Select character positions and a–z or 0–9.";
      return;
    }

    const total = characters.length ** positions.length;

    if (total > 10000) {
      const proceed = window.confirm(
        `This scan will check ${total.toLocaleString()} domains and may take a long time. Continue?`
      );

      if (!proceed) return;
    }

    scanning = true;
    domainInput.disabled = true;
    extensionSelect.disabled = true;
    includeLetters.disabled = true;
    includeNumbers.disabled = true;

    updateScanButton();
    resultsBox.replaceChildren();

    let completed = 0;

    progressBox.textContent = `Starting scan: 0/${total}`;

    try {
      for (const variant of generateVariants(name, positions, characters)) {
        const domain = `${variant}.${extension}`;
        const emoji = await getDomainEmoji(domain);

        addResult(domain, emoji, completed);
        completed++;

        progressBox.textContent =
          `Checking ${completed}/${total} — ${domain}`;

        // Pause between domains to reduce request bursts.
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      progressBox.textContent =
        `Scan complete: ${completed}/${total} domains checked.`;
    } catch (error) {
      console.error("Scanner error:", error);
      progressBox.textContent =
        `Scan stopped after ${completed}/${total} domains.`;
    } finally {
      scanning = false;
      domainInput.disabled = false;
      extensionSelect.disabled = false;
      includeLetters.disabled = false;
      includeNumbers.disabled = false;

      updateScanButton();
    }
  }

  function setSort(emoji) {
    // Clicking the selected option again resets the order.
    sortEmoji = sortEmoji === emoji ? null : emoji;

    sortButtons.forEach(button => {
      const active = button.dataset.sort === sortEmoji;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    sortResults();
  }

  sortButtons.forEach(button => {
    button.addEventListener("click", () => {
      setSort(button.dataset.sort);
    });
  });

  infoButton.addEventListener("click", () => {
    const isHidden = infoBox.hidden;
    infoBox.hidden = !isHidden;
    infoButton.setAttribute("aria-expanded", String(isHidden));
  });

  domainInput.addEventListener("input", () => {
    if (scanning) return;

    selectedPositions.clear();
    resultsBox.replaceChildren();
    renderCharacterButtons();
  });

  extensionSelect.addEventListener("change", () => {
    if (scanning) return;

    resultsBox.replaceChildren();
    renderCharacterButtons();
  });

  includeLetters.addEventListener("change", updateScanButton);
  includeNumbers.addEventListener("change", updateScanButton);
  scanButton.addEventListener("click", startScan);

  renderCharacterButtons();
})();
