// Register Chart.js plugin
Chart.register(ChartDataLabels);

// OB-specific mapping: Secondary categories (for pie charts) mapped to tertiary labor functions
const obSecondaryCategories = {
  "CSIOC": [
    "CSIOC Heavy Picking",
    "CSIOC Picking",
    "Pick to Belt",
    "CSIOC Bulk Pick"
  ],
  "Fetch": [
    "Fetch Operator"
  ],
  "Flow Picking": [
    "Flow Picking"
  ],
  "Induction": [
    "Induction - Indirect",
    "Induction Scan"
  ],
  "Multis": [
    "Audit / Stager",
    "Multi-Pack",
    "Multis Air Picking",
    "Multis Ground Picking"
  ],
  "OB Transfers": [
    "Transfer Loading",
    "Transfer Palletizing",
    "Transfer Picking",
    "Transfer Shipping",
    "Transfer – Dock Stocker OB"
  ],
  "Shipping": [
    "Multis Ran Pack and Tape",
    "Outbound Shipping",
    "Pallet Wrangler - Dock Stocker OB",
    "Pallet Wrangler – Reach OB",
    "Truck Loader"
  ],
  "Singles": [
    "Autopack Picking",
    "Autopack Support",
    "Autopacking",
    "Singles Air Picking",
    "Singles Box Shopper",
    "Singles Bulk",
    "Singles Ground Picking",
    "Singles Packing",
    "Singles Packing - VLA",
    "Singles Ran Pack and Tape",
    "Water Spider"
  ],
  "Staging": [
    "Line Loader"
  ],
  "Support": [
    "OB Escalation Specialist",
    "Outbound Lead",
    "Outbound Training",
    "Problem PK",
    "SME"
  ],
  "UOM": [
    "Bulk Picking",
    "UOM Loader",
    "UOM Packing",
    "UOM Bulk Pick"
  ],
  "Unallocated": [
    "Unallocated",
    "On-Clock Unallocated"
  ]
};

// Color scheme for OB secondary categories
const obCategoryColors = {
  "CSIOC": "#1e88e5",
  "Fetch": "#9c27b0",
  "Flow Picking": "#ff5722",
  "Induction": "#43a047",
  "Multis": "#fdd835",
  "OB Transfers": "#795548",
  "Shipping": "#fb8c00",
  "Singles": "#8e24aa",
  "Staging": "#4caf50",
  "Support": "#ff9800",
  "UOM": "#009688",
  "Unallocated": "#e53935"
};

let currentChart = null;
let chartA = null;
let chartB = null;
let datasetA = null;
let datasetB = null;
let isComparisonMode = false;
let singleModeData = null;

// Storage keys for persistence
const STORAGE_KEYS = {
  singleData: 'obHours_singleData',
  datasetA: 'obHours_datasetA',
  datasetB: 'obHours_datasetB',
  mode: 'obHours_mode',
  isLeaving: 'spa_isLeaving',
  version: 'obHours_version'
};

// Current version - increment this when you make changes to force cache clear
const CURRENT_VERSION = '2.0';

// Enhanced chart creation function
function createChart(breakdownTotals, canvasId, title, dataset = null) {
  try {
    const ctx = document.getElementById(canvasId);

    if (!ctx) {
      console.error(`Canvas element ${canvasId} not found`);
      return;
    }

    // Destroy existing chart
    if (dataset === 'A' && chartA) {
      chartA.destroy();
      chartA = null;
    } else if (dataset === 'B' && chartB) {
      chartB.destroy();
      chartB = null;
    } else if (!dataset && currentChart) {
      currentChart.destroy();
      currentChart = null;
    }

    const sortedGroups = Object.entries(breakdownTotals)
      .sort(([,a], [,b]) => b - a);

    const chartData = {
      labels: sortedGroups.map(([group]) => group),
      data: sortedGroups.map(([, hours]) => hours),
      backgroundColor: sortedGroups.map(([group]) => obCategoryColors[group] || '#95a5a6')
    };

    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded');
      return;
    }

    const chartConfig = {
      type: "pie",
      data: {
        labels: chartData.labels,
        datasets: [{
          label: "Hours Breakdown",
          data: chartData.data,
          backgroundColor: chartData.backgroundColor
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              usePointStyle: true,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const total = context.chart._metasets[0].total;
                const value = context.raw;
                const percent = ((value / total) * 100).toFixed(2);
                return `${context.label}: ${value.toFixed(2)} hrs (${percent}%)`;
              }
            }
          },
          title: {
            display: true,
            text: title,
            font: { size: 14 }
          }
        }
      }
    };

    // Add datalabels plugin if available
    try {
      if (typeof ChartDataLabels !== 'undefined') {
        chartConfig.options.plugins.datalabels = {
          color: '#fff',
          font: { weight: 'bold', size: 10 },
          formatter: (value, context) => {
            const total = context.chart._metasets[0].total;
            const percent = ((value / total) * 100).toFixed(1);
            return percent > 3 ? `${percent}%` : '';
          }
        };
        chartConfig.plugins = [ChartDataLabels];
      }
    } catch (pluginError) {
      console.warn('ChartDataLabels plugin error, creating chart without labels:', pluginError);
    }

    const chart = new Chart(ctx, chartConfig);

    // Store chart reference
    if (dataset === 'A') {
      chartA = chart;
    } else if (dataset === 'B') {
      chartB = chart;
    } else {
      currentChart = chart;
    }

  } catch (error) {
    console.error(`Error creating chart ${canvasId}:`, error);
  }
}

// Mode switching functions
function backToSingleMode() {
  isComparisonMode = false;
  document.getElementById('comparisonModeBtn').classList.remove('active');
  document.getElementById('singleModeContainer').style.display = 'block';
  document.getElementById('comparisonModeContainer').style.display = 'none';
  updatePDFButtonVisibility();
}

function setComparisonMode() {
  isComparisonMode = true;
  document.getElementById('comparisonModeBtn').classList.add('active');
  document.getElementById('singleModeContainer').style.display = 'none';
  document.getElementById('comparisonModeContainer').style.display = 'block';
  updatePDFButtonVisibility();
  saveToStorage();
}

function updatePDFButtonVisibility() {
  const pdfBtn = document.getElementById('pdfBtn');
  const pdfBtnComparison = document.getElementById('pdfBtnComparison');

  if (isComparisonMode) {
    if (pdfBtn) pdfBtn.style.display = 'none';
    if (pdfBtnComparison) {
      pdfBtnComparison.style.display = (datasetA && datasetB) ? 'inline-block' : 'none';
    }
  } else {
    if (pdfBtnComparison) pdfBtnComparison.style.display = 'none';
    if (pdfBtn) {
      pdfBtn.style.display = singleModeData ? 'inline-block' : 'none';
    }
  }
}

function showResults() {
  document.getElementById("inputSection").style.display = "none";
  document.getElementById("totalHours").style.display = "block";
  document.getElementById("hoursChart").style.display = "block";
  document.getElementById("resetButton").style.display = "inline-block";
  document.getElementById("resultsTable").style.display = "table";
}

function hideResults() {
  document.getElementById("inputSection").style.display = "block";
  document.getElementById("totalHours").style.display = "none";
  document.getElementById("hoursChart").style.display = "none";
  document.getElementById("resetButton").style.display = "none";
  document.getElementById("resultsTable").style.display = "none";
}

function showResultsA() {
  document.getElementById("totalHoursA").style.display = "block";
  document.getElementById("hoursChartA").style.display = "block";
  document.getElementById("resultsTableA").style.display = "table";
}

function showResultsB() {
  document.getElementById("totalHoursB").style.display = "block";
  document.getElementById("hoursChartB").style.display = "block";
  document.getElementById("resultsTableB").style.display = "table";
}

// Single mode clipboard processing
async function processClipboardData() {
  try {
    const text = await navigator.clipboard.readText();

    if (!text.trim()) {
      alert('No data found in clipboard. Please copy your Chewy LMS Outbound data first.');
      return;
    }

    processData(text);

  } catch (err) {
    console.error('Failed to read clipboard: ', err);
    alert('Unable to read from clipboard. Please make sure you have copied the data first.');
  }
}

// Comparison mode clipboard processing
async function processClipboardDataA() {
  try {
    const text = await navigator.clipboard.readText();

    if (!text.trim()) {
      alert('No data found in clipboard. Please copy your Dataset A first.');
      return;
    }

    datasetA = processDataComparison(text, 'A');

    if (datasetA) {
      showResultsA();
      localStorage.setItem(STORAGE_KEYS.datasetA, JSON.stringify(datasetA));
      checkForComparison();
    }

  } catch (err) {
    console.error('Failed to read clipboard: ', err);
    alert('Unable to read from clipboard. Please make sure you have copied the data first.');
  }
}

async function processClipboardDataB() {
  try {
    const text = await navigator.clipboard.readText();

    if (!text.trim()) {
      alert('No data found in clipboard. Please copy your Dataset B first.');
      return;
    }

    datasetB = processDataComparison(text, 'B');

    if (datasetB) {
      showResultsB();
      localStorage.setItem(STORAGE_KEYS.datasetB, JSON.stringify(datasetB));
      checkForComparison();
    }

  } catch (err) {
    console.error('Failed to read clipboard: ', err);
    alert('Unable to read from clipboard. Please make sure you have copied the data first.');
  }
}

function processData(text) {
  const { secondaryTotals, tertiaryDetails } = parseOBTextData(text);
  const outboundTotal = Object.values(secondaryTotals).reduce((a, b) => a + b, 0);

  if (outboundTotal === 0) {
    document.getElementById("totalHours").textContent = "No matching Outbound data found. Please check your data format.";
    return;
  }

  // Store single mode data for persistence
  singleModeData = {
    secondaryTotals,
    tertiaryDetails,
    total: outboundTotal,
    rawText: text
  };

  showResults();

  document.getElementById("totalHours").textContent = `Total Outbound Hours: ${outboundTotal.toFixed(2)} hrs`;

  updateEnhancedTable(secondaryTotals, tertiaryDetails, outboundTotal, 'hoursTable');
  createChart(secondaryTotals, 'hoursChart', 'Outbound Hours by Area');

  updatePDFButtonVisibility();
  saveToStorage();
}

function processDataComparison(text, dataset) {
  const { secondaryTotals, tertiaryDetails } = parseOBTextData(text);
  const outboundTotal = Object.values(secondaryTotals).reduce((a, b) => a + b, 0);

  if (outboundTotal === 0) {
    document.getElementById(`totalHours${dataset}`).textContent = "No matching data found.";
    return null;
  }

  document.getElementById(`totalHours${dataset}`).textContent = `Total: ${outboundTotal.toFixed(2)} hrs`;

  updateEnhancedTable(secondaryTotals, tertiaryDetails, outboundTotal, `hoursTable${dataset}`);
  createChart(secondaryTotals, `hoursChart${dataset}`, `Dataset ${dataset}`, dataset);

  const datasetObj = {
    secondaryTotals,
    tertiaryDetails,
    total: outboundTotal,
    rawText: text
  };

  updatePDFButtonVisibility();

  const storageKey = dataset === 'A' ? STORAGE_KEYS.datasetA : STORAGE_KEYS.datasetB;
  localStorage.setItem(storageKey, JSON.stringify(datasetObj));
  localStorage.setItem(STORAGE_KEYS.mode, 'comparison');

  return datasetObj;
}

// Enhanced parsing function for OB data
function parseOBTextData(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  const rows = lines.map(line => line.split(/\t+|\s{2,}/));

  const secondaryTotals = {};
  const tertiaryDetails = {};

  // Initialize secondary categories
  Object.keys(obSecondaryCategories).forEach(category => {
    secondaryTotals[category] = 0;
    tertiaryDetails[category] = {};
  });

  rows.forEach((row) => {
    const laborFunction = row[0]?.trim();
    const hoursStr = row[1]?.trim();
    const hours = parseFloat(hoursStr);

    if (!laborFunction || !hoursStr || isNaN(hours)) {
      return;
    }

    // Find which secondary category this labor function belongs to
    for (const secondaryCategory in obSecondaryCategories) {
      const tertiaryFunctions = obSecondaryCategories[secondaryCategory];

      if (tertiaryFunctions.includes(laborFunction)) {
        secondaryTotals[secondaryCategory] += hours;
        tertiaryDetails[secondaryCategory][laborFunction] = hours;
        break;
      }
    }
  });

  // Remove categories with 0 hours
  Object.keys(secondaryTotals).forEach(category => {
    if (secondaryTotals[category] === 0) {
      delete secondaryTotals[category];
      delete tertiaryDetails[category];
    }
  });

  return { secondaryTotals, tertiaryDetails };
}

// Enhanced table function with collapsible tertiary breakdown
function updateEnhancedTable(secondaryTotals, tertiaryDetails, outboundTotal, tableId) {
  const tbody = document.getElementById(tableId);
  tbody.innerHTML = '';

  const sortedSecondaryCategories = Object.entries(secondaryTotals)
    .sort(([,a], [,b]) => b - a);

  sortedSecondaryCategories.forEach(([secondaryCategory, totalHours]) => {
    const percent = (totalHours / outboundTotal) * 100;
    const rowId = `${tableId}-${secondaryCategory.replace(/\s+/g, '-')}`;

    // Main category row with dropdown toggle
    const mainRow = document.createElement("tr");
    mainRow.style.cursor = 'pointer';

    mainRow.innerHTML = `
      <td class="category-dropdown-header" style="font-weight: bold; background-color: ${obCategoryColors[secondaryCategory] || '#f8f9fa'};">
        <span class="dropdown-toggle" data-target="${rowId}" style="color: #000000;">▶</span>
        <span style="color: #000000;">${secondaryCategory}</span>
      </td>
      <td style="font-weight: bold;">${totalHours.toFixed(2)}</td>
      <td style="font-weight: bold;">${percent.toFixed(2)}%</td>
    `;

    // Add click handler for toggle
    mainRow.addEventListener('click', () => toggleTertiaryRows(rowId));
    tbody.appendChild(mainRow);

    // Tertiary function rows (initially hidden)
    const tertiaryFunctions = tertiaryDetails[secondaryCategory] || {};
    const sortedTertiary = Object.entries(tertiaryFunctions)
      .sort(([,a], [,b]) => b - a);

    sortedTertiary.forEach(([tertiaryFunction, hours]) => {
      const tertiaryPercent = (hours / outboundTotal) * 100;
      const subRow = document.createElement("tr");
      subRow.className = `tertiary-row ${rowId}-tertiary`;
      subRow.style.display = 'none';
      subRow.innerHTML = `
        <td style="padding-left: 30px; font-size: 0.85em; color: #6c757d; font-style: italic;">
          ${tertiaryFunction}
        </td>
        <td style="font-size: 0.85em; color: #6c757d;">${hours.toFixed(2)}</td>
        <td style="font-size: 0.85em; color: #6c757d;">${tertiaryPercent.toFixed(2)}%</td>
      `;
      tbody.appendChild(subRow);
    });
  });
}

// Toggle function for tertiary rows
function toggleTertiaryRows(rowId) {
  const tertiaryRows = document.querySelectorAll(`.${rowId}-tertiary`);
  const toggle = document.querySelector(`[data-target="${rowId}"]`);

  if (!tertiaryRows.length) return;

  // Check if first row has the 'visible' class
  const isVisible = tertiaryRows[0].classList.contains('visible');

  tertiaryRows.forEach(row => {
    if (isVisible) {
      row.classList.remove('visible');
      toggle.textContent = '▶';
    } else {
      row.classList.add('visible');
      toggle.textContent = '▼';
    }
  });
}

function checkForComparison() {
  if (datasetA && datasetB) {
    generateComparisonAnalysis();
  }
}

function generateComparisonAnalysis() {
  const analysisDiv = document.getElementById('comparisonAnalysis');
  const resultsDiv = document.getElementById('comparisonResults');

  // Get all unique secondary categories
  const allCategories = new Set([
    ...Object.keys(datasetA.secondaryTotals),
    ...Object.keys(datasetB.secondaryTotals)
  ]);

  let analysisHTML = '<div style="margin-bottom: 1.5rem;">';
  analysisHTML += `<p><strong>Percentage Comparison vs 4-Week Average:</strong> `;
  analysisHTML += `<span style="color: #dc3545;">Red = Overspend</span> | `;
  analysisHTML += `<span style="color: #28a745;">Green = Underspend</span></p>`;
  analysisHTML += '</div>';

  Array.from(allCategories).sort().forEach(category => {
    const hoursA = datasetA.secondaryTotals[category] || 0;
    const hoursB = datasetB.secondaryTotals[category] || 0;
    const percentA = datasetA.total > 0 ? (hoursA / datasetA.total * 100) : 0;
    const percentB = datasetB.total > 0 ? (hoursB / datasetB.total * 100) : 0;
    const percentDiff = percentB - percentA;

    let changeClass = 'unchanged';
    let changeText = 'No change';

    // Calculate hours impact: (percentDiff / 100) * datasetB.total
    const hoursImpact = (percentDiff / 100) * datasetB.total;
    const hoursImpactText = `${hoursImpact >= 0 ? '+' : ''}${hoursImpact.toFixed(1)} hrs`;

    if (Math.abs(percentDiff) > 0.1) {
      if (percentDiff > 0) {
        changeClass = 'increase';
        changeText = `+${percentDiff.toFixed(1)}% vs 4wk avg (${hoursImpactText})`;
      } else {
        changeClass = 'decrease';
        changeText = `${percentDiff.toFixed(1)}% vs 4wk avg (${hoursImpactText})`;
      }
    } else {
      changeText = `${percentDiff >= 0 ? '+' : ''}${percentDiff.toFixed(1)}% vs 4wk avg (${hoursImpactText})`;
    }

    const categoryId = `comparison-${category.replace(/\s+/g, '-')}`;

    // Main secondary category row (always visible with dropdown toggle)
    analysisHTML += `
      <div class="comparison-result-item ${changeClass}" style="cursor: pointer;" onclick="toggleComparisonTertiary('${categoryId}')">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="comparison-dropdown-toggle" id="${categoryId}-toggle">▶</span>
          <div class="function-name">${category}</div>
        </div>
        <div>
          <div style="font-size: 0.9rem; color: #6c757d;">
            4wk Avg: ${percentA.toFixed(1)}% |
            Daily: ${percentB.toFixed(1)}%
          </div>
          <div class="hours-change ${changeClass}">${changeText}</div>
        </div>
      </div>
    `;

    // Add ALL tertiary breakdowns (initially hidden)
    const tertiaryA = datasetA.tertiaryDetails[category] || {};
    const tertiaryB = datasetB.tertiaryDetails[category] || {};
    const allTertiaryFunctions = new Set([...Object.keys(tertiaryA), ...Object.keys(tertiaryB)]);

    if (allTertiaryFunctions.size > 0) {
      Array.from(allTertiaryFunctions).sort().forEach(tertiaryFunction => {
        const tertiaryHoursA = tertiaryA[tertiaryFunction] || 0;
        const tertiaryHoursB = tertiaryB[tertiaryFunction] || 0;
        const tertiaryPercentA = datasetA.total > 0 ? (tertiaryHoursA / datasetA.total * 100) : 0;
        const tertiaryPercentB = datasetB.total > 0 ? (tertiaryHoursB / datasetB.total * 100) : 0;
        const tertiaryDiff = tertiaryPercentB - tertiaryPercentA;

        let tertiaryChangeClass = 'unchanged';
        if (Math.abs(tertiaryDiff) > 0.1) {
          tertiaryChangeClass = tertiaryDiff > 0 ? 'increase' : 'decrease';
        }

        // Calculate hours impact for tertiary: (tertiaryDiff / 100) * datasetB.total
        const tertiaryHoursImpact = (tertiaryDiff / 100) * datasetB.total;
        const tertiaryHoursImpactText = `${tertiaryHoursImpact >= 0 ? '+' : ''}${tertiaryHoursImpact.toFixed(1)} hrs`;
        let tertiaryChangeText = `${tertiaryDiff >= 0 ? '+' : ''}${tertiaryDiff.toFixed(1)}% (${tertiaryHoursImpactText})`;

        // Determine background color based on change class
        let tertiaryBg = 'rgba(0,0,0,0.03)';
        let tertiaryBorderColor = obCategoryColors[category] || '#95a5a6';
        if (tertiaryChangeClass === 'increase') {
          tertiaryBg = '#fdf2f2';
          tertiaryBorderColor = '#e74c3c';
        } else if (tertiaryChangeClass === 'decrease') {
          tertiaryBg = '#f2fdf7';
          tertiaryBorderColor = '#27ae60';
        }

        analysisHTML += `
          <div class="comparison-tertiary-row ${tertiaryChangeClass} ${categoryId}-tertiary" style="display: none; margin-left: 40px; margin-top: 5px; padding: 10px; border-left: 3px solid ${tertiaryBorderColor}; background: ${tertiaryBg};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div class="function-name" style="font-size: 0.9em; font-weight: normal; font-style: italic; color: #495057;">${tertiaryFunction}</div>
              <div style="text-align: right;">
                <div style="font-size: 0.85rem; color: #6c757d;">
                  4wk: ${tertiaryPercentA.toFixed(1)}% | Daily: ${tertiaryPercentB.toFixed(1)}%
                </div>
                <div class="hours-change ${tertiaryChangeClass}" style="font-size: 0.85em; padding: 3px 8px; display: inline-block; margin-top: 4px;">${tertiaryChangeText}</div>
              </div>
            </div>
          </div>
        `;
      });
    }
  });

  resultsDiv.innerHTML = analysisHTML;
  analysisDiv.style.display = 'block';
}

// Toggle function for comparison tertiary rows
function toggleComparisonTertiary(categoryId) {
  const tertiaryRows = document.querySelectorAll(`.${categoryId}-tertiary`);
  const toggle = document.getElementById(`${categoryId}-toggle`);

  const firstRow = tertiaryRows[0];
  if (!firstRow) return;

  // Check if first row has the 'visible' class
  const isVisible = firstRow.classList.contains('visible');

  tertiaryRows.forEach(row => {
    if (isVisible) {
      row.classList.remove('visible');
    } else {
      row.classList.add('visible');
    }
  });

  if (toggle) {
    toggle.textContent = isVisible ? '▶' : '▼';
  }
}

function resetPage() {
  localStorage.removeItem(STORAGE_KEYS.singleData);
  singleModeData = null;
  document.getElementById('hoursTable').innerHTML = '';

  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }

  hideResults();
  updatePDFButtonVisibility();
}

function resetComparison() {
  localStorage.removeItem(STORAGE_KEYS.datasetA);
  localStorage.removeItem(STORAGE_KEYS.datasetB);
  datasetA = null;
  datasetB = null;

  if (chartA) {
    chartA.destroy();
    chartA = null;
  }

  if (chartB) {
    chartB.destroy();
    chartB = null;
  }

  document.getElementById('hoursTableA').innerHTML = '';
  document.getElementById('hoursTableB').innerHTML = '';
  document.getElementById('totalHoursA').style.display = 'none';
  document.getElementById('totalHoursB').style.display = 'none';
  document.getElementById('hoursChartA').style.display = 'none';
  document.getElementById('hoursChartB').style.display = 'none';
  document.getElementById('resultsTableA').style.display = 'none';
  document.getElementById('resultsTableB').style.display = 'none';
  document.getElementById('comparisonAnalysis').style.display = 'none';
  updatePDFButtonVisibility();
}

// Storage functions
function saveToStorage() {
  try {
    if (singleModeData) {
      localStorage.setItem(STORAGE_KEYS.singleData, JSON.stringify(singleModeData));
    }
    if (datasetA) {
      localStorage.setItem(STORAGE_KEYS.datasetA, JSON.stringify(datasetA));
    }
    if (datasetB) {
      localStorage.setItem(STORAGE_KEYS.datasetB, JSON.stringify(datasetB));
    }
    localStorage.setItem(STORAGE_KEYS.mode, isComparisonMode ? 'comparison' : 'single');
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}

function loadFromStorage() {
  try {
    const savedMode = localStorage.getItem(STORAGE_KEYS.mode);
    const savedSingleData = localStorage.getItem(STORAGE_KEYS.singleData);
    const savedDatasetA = localStorage.getItem(STORAGE_KEYS.datasetA);
    const savedDatasetB = localStorage.getItem(STORAGE_KEYS.datasetB);

    if (savedSingleData) {
      singleModeData = JSON.parse(savedSingleData);
    }
    if (savedDatasetA) {
      datasetA = JSON.parse(savedDatasetA);
    }
    if (savedDatasetB) {
      datasetB = JSON.parse(savedDatasetB);
    }

    setTimeout(() => {
      if (savedMode === 'comparison' && (datasetA || datasetB)) {
        setComparisonMode();

        setTimeout(() => {
          if (datasetA && datasetB) {
            restoreDatasetA().then(() => {
              return restoreDatasetB();
            }).then(() => {
              setTimeout(() => generateComparisonAnalysis(), 100);
            });
          } else if (datasetA) {
            restoreDatasetA();
          } else if (datasetB) {
            restoreDatasetB();
          }
        }, 300);

      } else if (singleModeData) {
        restoreSingleMode();
      }
    }, 100);

  } catch (e) {
    console.error('Error loading from localStorage:', e);
  }
}

function restoreSingleMode() {
  if (singleModeData) {
    showResults();

    setTimeout(() => {
      document.getElementById("totalHours").textContent = `Total Outbound Hours: ${singleModeData.total.toFixed(2)} hrs`;
      updateEnhancedTable(singleModeData.secondaryTotals, singleModeData.tertiaryDetails, singleModeData.total, 'hoursTable');
      createChart(singleModeData.secondaryTotals, 'hoursChart', 'Outbound Hours by Area');
    }, 100);
  }
}

function restoreDatasetA() {
  return new Promise((resolve) => {
    if (datasetA) {
      const totalEl = document.getElementById('totalHoursA');
      const tableEl = document.getElementById('hoursTableA');
      const chartEl = document.getElementById('hoursChartA');

      if (totalEl && tableEl && chartEl) {
        try {
          totalEl.textContent = `Total: ${datasetA.total.toFixed(2)} hrs`;
          updateEnhancedTable(datasetA.secondaryTotals, datasetA.tertiaryDetails, datasetA.total, 'hoursTableA');
          createChart(datasetA.secondaryTotals, 'hoursChartA', 'Dataset A', 'A');
          showResultsA();
        } catch (error) {
          console.error('Error during Dataset A restoration:', error);
        }
      }
    }
    resolve();
  });
}

function restoreDatasetB() {
  return new Promise((resolve) => {
    if (datasetB) {
      const totalEl = document.getElementById('totalHoursB');
      const tableEl = document.getElementById('hoursTableB');
      const chartEl = document.getElementById('hoursChartB');

      if (totalEl && tableEl && chartEl) {
        try {
          totalEl.textContent = `Total: ${datasetB.total.toFixed(2)} hrs`;
          updateEnhancedTable(datasetB.secondaryTotals, datasetB.tertiaryDetails, datasetB.total, 'hoursTableB');
          createChart(datasetB.secondaryTotals, 'hoursChartB', 'Dataset B', 'B');
          showResultsB();
        } catch (error) {
          console.error('Error during Dataset B restoration:', error);
        }
      }
    }
    resolve();
  });
}

// Basic PDF generation function (simplified version)
async function generatePDFReport() {
  try {
    if (typeof window.jsPDF === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      document.head.appendChild(script);

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Simple header
    doc.setFontSize(20);
    doc.text('Outbound Hours Analysis Report', 20, 20);

    // Add timestamp
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 35);

    // Generate filename
    const fileName = isComparisonMode ?
      `outbound-hours-comparison_${new Date().toISOString().split('T')[0]}.pdf` :
      `outbound-hours-analysis_${new Date().toISOString().split('T')[0]}.pdf`;

    // Save with basic content (charts can be added later as enhancement)
    if (isComparisonMode && datasetA && datasetB) {
      doc.text('Comparison Mode - Both datasets loaded', 20, 50);
    } else if (singleModeData) {
      doc.text(`Total Outbound Hours: ${singleModeData.total.toFixed(2)}`, 20, 50);
    }

    doc.save(fileName);

  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Error generating PDF. Please try again.');
  }
}

// Page load handling
window.addEventListener('beforeunload', () => {
  localStorage.setItem(STORAGE_KEYS.isLeaving, 'true');
});

function handlePageLoad() {
  // Check version and clear data if outdated
  const savedVersion = localStorage.getItem(STORAGE_KEYS.version);
  const savedTheme = localStorage.getItem('theme');

  if (savedVersion !== CURRENT_VERSION) {
    console.log('Version mismatch - clearing all data. Old:', savedVersion, 'New:', CURRENT_VERSION);

    // Clear all stored data except theme
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    localStorage.removeItem(STORAGE_KEYS.isLeaving);

    // Set new version
    localStorage.setItem(STORAGE_KEYS.version, CURRENT_VERSION);
  }

  // Restore theme preference
  if (savedTheme) {
    localStorage.setItem('theme', savedTheme);
  }

  // Reset all UI elements to initial state
  resetAllUIElements();
  updatePDFButtonVisibility();
}

function resetAllUIElements() {
  // Reset single mode
  document.getElementById('totalHours').style.display = 'none';
  document.getElementById('totalHours').textContent = '';
  document.getElementById('hoursChart').style.display = 'none';
  document.getElementById('resultsTable').style.display = 'none';
  document.getElementById('hoursTable').innerHTML = '';
  document.getElementById('resetButton').style.display = 'none';
  document.getElementById('pdfBtn').style.display = 'none';

  // Reset comparison mode
  document.getElementById('totalHoursA').style.display = 'none';
  document.getElementById('totalHoursA').textContent = '';
  document.getElementById('totalHoursB').style.display = 'none';
  document.getElementById('totalHoursB').textContent = '';
  document.getElementById('hoursChartA').style.display = 'none';
  document.getElementById('hoursChartB').style.display = 'none';
  document.getElementById('resultsTableA').style.display = 'none';
  document.getElementById('resultsTableB').style.display = 'none';
  document.getElementById('hoursTableA').innerHTML = '';
  document.getElementById('hoursTableB').innerHTML = '';
  document.getElementById('comparisonAnalysis').style.display = 'none';
  document.getElementById('comparisonResults').innerHTML = '';
  document.getElementById('pdfBtnComparison').style.display = 'none';

  // Destroy existing charts
  const existingCharts = ['hoursChart', 'hoursChartA', 'hoursChartB'];
  existingCharts.forEach(chartId => {
    const chart = Chart.getChart(chartId);
    if (chart) {
      chart.destroy();
    }
  });

  // Reset to single mode
  document.getElementById('singleModeContainer').style.display = 'block';
  document.getElementById('comparisonModeContainer').style.display = 'none';

  // Reset comparison mode button
  const comparisonBtn = document.getElementById('comparisonModeBtn');
  if (comparisonBtn) {
    comparisonBtn.classList.remove('active');
  }

  // Clear any global data variables
  if (typeof window.singleModeData !== 'undefined') {
    window.singleModeData = null;
  }
  if (typeof window.comparisonDataA !== 'undefined') {
    window.comparisonDataA = null;
  }
  if (typeof window.comparisonDataB !== 'undefined') {
    window.comparisonDataB = null;
  }
}

// Dark Mode Functionality
function toggleDarkMode() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  // Apply theme
  document.documentElement.setAttribute('data-theme', newTheme);

  // Update button text and icon
  const darkModeBtn = document.getElementById('darkModeBtn');
  if (newTheme === 'dark') {
    darkModeBtn.innerHTML = '☀️ Light';
  } else {
    darkModeBtn.innerHTML = '🌙 Dark';
  }

  // Save preference to localStorage
  localStorage.setItem('theme', newTheme);

  // Update chart backgrounds if charts exist
  updateChartBackgrounds(newTheme);

  // Refresh tables to update text colors
  if (singleModeData) {
    updateEnhancedTable(singleModeData.secondaryTotals, singleModeData.tertiaryDetails, singleModeData.total, 'hoursTable');
  }
  if (datasetA) {
    updateEnhancedTable(datasetA.secondaryTotals, datasetA.tertiaryDetails, datasetA.total, 'hoursTableA');
  }
  if (datasetB) {
    updateEnhancedTable(datasetB.secondaryTotals, datasetB.tertiaryDetails, datasetB.total, 'hoursTableB');
  }
}

function updateChartBackgrounds(theme) {
  // Update single mode chart
  const singleChart = Chart.getChart('hoursChart');
  if (singleChart) {
    const bgColor = theme === 'dark' ? '#2d2d2d' : 'white';
    singleChart.options.plugins.legend.labels.color = theme === 'dark' ? '#e9ecef' : '#333';
    singleChart.canvas.style.backgroundColor = bgColor;
    singleChart.update();
  }

  // Update comparison mode charts
  const chartA = Chart.getChart('hoursChartA');
  if (chartA) {
    const bgColor = theme === 'dark' ? '#2d2d2d' : 'white';
    chartA.options.plugins.legend.labels.color = theme === 'dark' ? '#e9ecef' : '#333';
    chartA.canvas.style.backgroundColor = bgColor;
    chartA.update();
  }

  const chartB = Chart.getChart('hoursChartB');
  if (chartB) {
    const bgColor = theme === 'dark' ? '#2d2d2d' : 'white';
    chartB.options.plugins.legend.labels.color = theme === 'dark' ? '#e9ecef' : '#333';
    chartB.canvas.style.backgroundColor = bgColor;
    chartB.update();
  }
}

function initializeDarkMode() {
  // Check for saved theme preference or default to light mode
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Update button text based on current theme
  const darkModeBtn = document.getElementById('darkModeBtn');
  if (savedTheme === 'dark') {
    darkModeBtn.innerHTML = '☀️ Light';
  } else {
    darkModeBtn.innerHTML = '🌙 Dark';
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initializeDarkMode();
  handlePageLoad();
});