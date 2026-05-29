const STATUSES = [
  { name: "Non interessato", color: "#D62828" },
  { name: "In attesa dei contatti", color: "#D9D9D9" },
  { name: "Non contattato", color: "#F4A6A6" },
  { name: "Prima call fissata", color: "#8ECAE6" },
  { name: "Confronto in corso", color: "#FFD166" },
  { name: "Produzione fissata", color: "#F77F00" },
  { name: "Produzione conclusa", color: "#90BE6D" },
  { name: "Montaggio in corso", color: "#9B5DE5" },
  { name: "Lavorazione ultimata", color: "#2D6A4F" },
];

const COLOR_BY_STATUS = Object.fromEntries(STATUSES.map(s => [s.name, s.color]));
const DEFAULT_COLOR = "#FFFFFF";
const BORDER_COLOR = "#1d1d1b";

let rows = [];
let dataByArea = new Map();

async function init() {
  setupFilters();
  document.getElementById("refreshBtn").addEventListener("click", loadAndRender);
  document.getElementById("statusFilter").addEventListener("change", applyFilters);
  document.getElementById("searchBox").addEventListener("input", applyFilters);
  await loadAndRender();
}

function getCsvUrl() {
  const configured = window.MAPPA_CONFIG && window.MAPPA_CONFIG.CSV_URL;
  return configured && configured.trim() ? configured.trim() : "mappa_italia_aree.csv";
}

async function loadAndRender() {
  showMessage("");
  try {
    await loadSvg();
    rows = await loadCsv();
    dataByArea = new Map(rows.map(row => [row.area_key, row]));
    applyDataToMap();
    renderSummary();
    applyFilters();
    document.getElementById("lastUpdated").textContent = `Dati aggiornati: ${new Date().toLocaleString("it-IT")}`;
  } catch (error) {
    console.error(error);
    showMessage("Non riesco a caricare i dati. Controlla il link CSV in config.js o il caricamento dei file su Netlify/GitHub Pages.");
  }
}

async function loadSvg() {
  const response = await fetch("mappa_italia.svg", { cache: "no-store" });
  if (!response.ok) throw new Error("SVG non caricato");
  const svgText = await response.text();
  document.getElementById("map-container").innerHTML = svgText;
}

async function loadCsv() {
  const url = getCsvUrl();
  const response = await fetch(addCacheBuster(url), { cache: "no-store" });
  if (!response.ok) throw new Error("CSV non caricato");
  const csvText = await response.text();
  return parseCsv(csvText).filter(row => row.area_key);
}

function addCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_=${Date.now()}`;
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/);
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || "").trim();
    });
    return row;
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function applyDataToMap() {
  const tooltip = document.getElementById("tooltip");
  const shapes = document.querySelectorAll("#map-container svg .area-shape");
  const missing = new Set();

  shapes.forEach(shape => {
    const key = shape.dataset.areaKey;
    const row = dataByArea.get(key);
    const status = row ? row.stato : "";
    const fill = COLOR_BY_STATUS[status] || DEFAULT_COLOR;

    shape.style.fill = fill;
    shape.style.stroke = BORDER_COLOR;
    shape.style.strokeWidth = "1";

    shape.addEventListener("mousemove", event => {
      const current = dataByArea.get(key);
      const name = current?.provincia_area || shape.dataset.areaName || key;
      const region = current?.regione || shape.dataset.region || "";
      const stato = current?.stato || "Non indicato";
      tooltip.style.display = "block";
      tooltip.style.left = event.clientX + 14 + "px";
      tooltip.style.top = event.clientY + 14 + "px";
      tooltip.innerHTML = `<strong>${escapeHtml(name)}</strong><br>${escapeHtml(region)}<br>Stato: <strong>${escapeHtml(stato)}</strong>`;
    });

    shape.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });

    if (!row) missing.add(key);
  });

  if (missing.size) {
    console.warn("Aree presenti nello SVG ma assenti nel CSV:", Array.from(missing));
  }
}

function setupFilters() {
  const filter = document.getElementById("statusFilter");
  STATUSES.forEach(status => {
    const option = document.createElement("option");
    option.value = status.name;
    option.textContent = status.name;
    filter.appendChild(option);
  });
}

function applyFilters() {
  const selectedStatus = document.getElementById("statusFilter").value;
  const search = document.getElementById("searchBox").value.trim().toLowerCase();
  const shapes = document.querySelectorAll("#map-container svg .area-shape");

  shapes.forEach(shape => {
    const key = shape.dataset.areaKey;
    const row = dataByArea.get(key);
    const haystack = [key, row?.provincia_area, row?.regione, row?.stato].filter(Boolean).join(" ").toLowerCase();
    const matchStatus = !selectedStatus || row?.stato === selectedStatus;
    const matchSearch = !search || haystack.includes(search);
    const visible = matchStatus && matchSearch;
    shape.classList.toggle("is-dimmed", !visible);
    shape.classList.toggle("is-highlighted", visible && (!!selectedStatus || !!search));
  });
}

function renderSummary() {
  const counts = Object.fromEntries(STATUSES.map(s => [s.name, 0]));
  rows.forEach(row => {
    if (counts[row.stato] !== undefined) counts[row.stato] += 1;
  });
  document.getElementById("summary").innerHTML = STATUSES.map(status => `
    <div class="summary-item" style="border-left-color:${status.color}">
      ${escapeHtml(status.name)}: <strong>${counts[status.name]}</strong>
    </div>
  `).join("");
}

function showMessage(text) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
