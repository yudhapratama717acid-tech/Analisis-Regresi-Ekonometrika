let uploadedColumns = [];
let rawDataset = [];
let analysisData = null;
let axisOrder = null; // { x, y } pilihan sumbu X & Y pada plot 3D
const DEFAULT_CAMERA = { eye: { x: 1.25, y: 1.25, z: 1.25 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } };

/* ===== Tema Plotly (selaras dengan desain gelap) ===== */
const THEME = {
    gold: '#e3c488', violet: '#8b7cf6', teal: '#4fd1c5', rose: '#f87199',
    text: '#b4b9d0', grid: 'rgba(255,255,255,0.07)', line: 'rgba(255,255,255,0.14)'
};
const PLOT_CONFIG = { responsive: true, displaylogo: false };

function baseLayout(title, extra = {}) {
    return Object.assign({
        title: { text: title, font: { family: 'Fraunces, Georgia, serif', size: 17, color: '#eef0f8' }, x: 0.02 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'Inter, sans-serif', color: THEME.text, size: 12 },
        legend: { orientation: 'h', y: -0.2, font: { color: THEME.text } },
        hoverlabel: { bgcolor: '#12162b', bordercolor: THEME.gold, font: { color: '#eef0f8' } }
    }, extra);
}
function axisStyle(title) {
    return { title: { text: title }, gridcolor: THEME.grid, zerolinecolor: THEME.line, linecolor: THEME.line, tickfont: { color: THEME.text } };
}

function setLoading(btn, isLoading) {
    btn.classList.toggle('loading', isLoading);
}

/* ===== Dropzone (klik / seret berkas) ===== */
(function initDropzone() {
    const input = document.getElementById('csvFile');
    const zone = document.getElementById('dropzone');
    const title = document.getElementById('dzTitle');
    const sub = document.getElementById('dzSub');
    function showFile() {
        if (input.files.length) {
            zone.classList.add('has-file');
            title.textContent = input.files[0].name;
            sub.textContent = (input.files[0].size / 1024).toFixed(1) + ' KB · siap dimuat';
        }
    }
    input.addEventListener('change', showFile);
    ['dragenter', 'dragover'].forEach(ev => input.addEventListener(ev, () => zone.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(ev => input.addEventListener(ev, () => zone.classList.remove('dragover')));
})();

document.getElementById('uploadBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('csvFile');
    if (fileInput.files.length === 0) {
        alert('Silakan pilih file CSV terlebih dahulu.');
        return;
    }
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const uploadBtn = document.getElementById('uploadBtn');
    setLoading(uploadBtn, true);
    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const result = await response.json();
        if (response.ok) {
            uploadedColumns = result.columns;
            rawDataset = result.data;
            populateVariables(uploadedColumns);
            document.getElementById('variableSelection').classList.remove('hidden');
        } else {
            alert(result.error);
        }
    } catch (err) {
        console.error(err);
        alert('Gagal mengunggah file.');
    } finally {
        setLoading(uploadBtn, false);
    }
});

function populateVariables(columns) {
    const ySelect = document.getElementById('ySelect');
    const xContainer = document.getElementById('xCheckboxContainer');
    ySelect.innerHTML = '';
    xContainer.innerHTML = '';

    columns.forEach(col => {
        const option = document.createElement('option');
        option.value = col;
        option.textContent = col;
        ySelect.appendChild(option);

        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" id="x_${col}" value="${col}">
            <label for="x_${col}">${col}</label>
        `;
        xContainer.appendChild(div);
    });
}

document.getElementById('runAnalysisBtn').addEventListener('click', async () => {
    const btn = document.getElementById('runAnalysisBtn');
    setLoading(btn, true);
    try {
        await executeAnalysis();
        renderEditableDataTable();
        document.getElementById('dataEditorCard').classList.remove('hidden');
        if (analysisData) {
            document.getElementById('resultsContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } finally {
        setLoading(btn, false);
    }
});

async function executeAnalysis() {
    const yVar = document.getElementById('ySelect').value;
    const xVars = [];
    document.querySelectorAll('#xCheckboxContainer input[type="checkbox"]:checked').forEach(cb => {
        xVars.push(cb.value);
    });

    if (xVars.length === 0) {
        alert('Pilih minimal satu variabel X.');
        return;
    }
    if (xVars.includes(yVar)) {
        alert('Variabel Y dan X tidak boleh sama.');
        return;
    }

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ y: yVar, x: xVars })
        });
        const result = await response.json();

        if (response.ok) {
            analysisData = result;
            displayResults(result);
        } else {
            alert(result.error);
        }
    } catch (err) {
        console.error(err);
        alert('Terjadi kesalahan saat menganalisis data.');
    }
}

function renderEditableDataTable() {
    const table = document.getElementById('editableDataTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (rawDataset.length === 0) return;

    const cols = Object.keys(rawDataset[0]);
    let headerRow = '<tr><th>No</th>';
    cols.forEach(col => headerRow += `<th>${col}</th>`);
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    rawDataset.forEach((row, rowIndex) => {
        let rowHtml = `<tr><td>${rowIndex + 1}</td>`;
        cols.forEach(col => {
            const val = row[col];
            rowHtml += `<td><input type="number" step="any" class="editable-cell" data-row="${rowIndex}" data-col="${col}" value="${val}"></td>`;
        });
        rowHtml += '</tr>';
        tbody.innerHTML += rowHtml;
    });

    let timeout = null;
    document.querySelectorAll('.editable-cell').forEach(input => {
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                readEditableTableData();
                await sendUpdateAndReanalyze();
            }, 400);
        });
    });
}

function readEditableTableData() {
    const table = document.getElementById('editableDataTable');
    const inputs = table.querySelectorAll('tbody input.editable-cell');
    inputs.forEach(input => {
        const rowIndex = parseInt(input.getAttribute('data-row'));
        const colName = input.getAttribute('data-col');
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
            rawDataset[rowIndex][colName] = val;
        } else {
            rawDataset[rowIndex][colName] = input.value;
        }
    });
}

async function sendUpdateAndReanalyze() {
    try {
        const res = await fetch('/update_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: rawDataset })
        });
        const resJson = await res.json();
        if (resJson.success) {
            await executeAnalysisSilent();
        }
    } catch(err) {
        console.error('Auto-update error:', err);
    }
}

async function executeAnalysisSilent() {
    const yVar = document.getElementById('ySelect').value;
    const xVars = [];
    document.querySelectorAll('#xCheckboxContainer input[type="checkbox"]:checked').forEach(cb => {
        xVars.push(cb.value);
    });

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ y: yVar, x: xVars })
        });
        const result = await response.json();
        if (response.ok) {
            analysisData = result;
            displayResults(result);
        }
    } catch (err) {
        console.error(err);
    }
}

function displayResults(data) {
    document.getElementById('resultsContainer').classList.remove('hidden');

    document.getElementById('modelTypeVal').textContent = data.regression_type;
    document.getElementById('r2Val').textContent = data.r_squared;
    document.getElementById('adjR2Val').textContent = data.adj_r_squared;

    const tbody = document.querySelector('#regressionTable tbody');
    tbody.innerHTML = '';
    data.summary_table.forEach(row => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${row.variable}</strong></td>
                <td>${row.coefficient}</td>
                <td>${row.std_error}</td>
                <td>${row.t_value}</td>
                <td>${row.p_value}</td>
            </tr>
        `;
    });

    const covCard = document.getElementById('covCard');
    if (data.covariance_summary) {
        covCard.classList.remove('hidden');
        renderCovarianceTable(data.covariance_summary.cov_matrix);
    } else {
        covCard.classList.add('hidden');
    }

    renderPlots(data);
    setupSliders(data);
    renderCalculationTable(data.calculation_table);
    
    const manualCard = document.getElementById('manualExplanationCard');
    const manualContent = document.getElementById('manualExplanationContent');
    if (data.manual_explanation) {
        manualCard.classList.remove('hidden');
        manualContent.innerHTML = data.manual_explanation;
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise();
        }
    } else {
        manualCard.classList.add('hidden');
    }

    renderCorrelationHeatmap(data.corr_matrix);
    renderDescStats(data.desc_stats);
}

function renderCovarianceTable(covMatrix) {
    const table = document.getElementById('covTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const keys = Object.keys(covMatrix);
    let headerRow = '<tr><th>Variabel</th>';
    keys.forEach(k => headerRow += `<th>${k}</th>`);
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    keys.forEach(rowKey => {
        let rowHtml = `<tr><td><strong>${rowKey}</strong></td>`;
        keys.forEach(colKey => {
            rowHtml += `<td>${covMatrix[rowKey][colKey].toFixed(4)}</td>`;
        });
        rowHtml += '</tr>';
        tbody.innerHTML += rowHtml;
    });
}

function renderPlots(data) {
    const plotContainer = document.getElementById('plotContainer');
    plotContainer.innerHTML = '';

    const xVars = data.data_points.x_vars;
    const yVar = data.data_points.y_var;
    const values = data.data_points.values;

    const axisControls = document.getElementById('axisControls');
    axisControls.classList.toggle('hidden', !(xVars.length === 2 && data.plane_3d));

    if (xVars.length > 3) {
        plotContainer.innerHTML = '<p class="plot-note"><em>Jumlah variabel X > 3, plot grafik 2D/3D dinonaktifkan sesuai ketentuan. Silakan gunakan slider prediksi di bawah.</em></p>';
    } else {
        if (xVars.length === 2 && data.plane_3d) {
            plotContainer.style.height = '650px';

            // Pertahankan pilihan sumbu selama variabel X yang dipilih sama
            if (!axisOrder || !xVars.includes(axisOrder.x) || !xVars.includes(axisOrder.y) || axisOrder.x === axisOrder.y) {
                axisOrder = { x: xVars[0], y: xVars[1] };
            }
            setupAxisControls(data);

            const plane = data.plane_3d;
            const gridOf = name => (name === plane.x1_name ? plane.x1_grid : plane.x2_grid);

            const traceScatter = {
                x: values[axisOrder.x],
                y: values[axisOrder.y],
                z: values[yVar],
                mode: 'markers',
                type: 'scatter3d',
                marker: { size: 5, color: THEME.gold, line: { color: '#12162b', width: 1 } },
                name: 'Data Aktual'
            };
            const tracePlane = {
                x: gridOf(axisOrder.x),
                y: gridOf(axisOrder.y),
                z: plane.y_grid,
                type: 'surface',
                colorscale: [[0, '#2a2468'], [0.5, '#8b7cf6'], [1, '#e3c488']],
                opacity: 0.8,
                showscale: false,
                name: 'Bidang Regresi'
            };
            const sceneAxis = t => Object.assign(axisStyle(t), { backgroundcolor: 'rgba(0,0,0,0)', showbackground: false });
            const layout = baseLayout(`3D Scatter & Regression Plane (${axisOrder.x} & ${axisOrder.y} vs ${yVar})`, {
                scene: { xaxis: sceneAxis(axisOrder.x), yaxis: sceneAxis(axisOrder.y), zaxis: sceneAxis(yVar), camera: currentCamera() },
                margin: { l: 10, r: 10, b: 10, t: 50 }
            });
            Plotly.newPlot('plotContainer', [traceScatter, tracePlane], layout, PLOT_CONFIG);
        } else {
            plotContainer.style.height = 'auto';
            xVars.forEach((x, index) => {
                const divId = `plot_${index}`;
                const div = document.createElement('div');
                div.id = divId;
                div.style.height = '420px';
                div.style.marginBottom = '20px';
                plotContainer.appendChild(div);

                const xVals = values[x];
                const yVals = values[yVar];

                const traceScatter = { x: xVals, y: yVals, mode: 'markers', type: 'scatter', name: 'Data', marker: { color: THEME.gold, size: 9, opacity: 0.9, line: { color: '#12162b', width: 1.5 } } };

                const coeff = data.summary_table.find(item => item.variable === x)?.coefficient || 0;
                const intercept = data.summary_table.find(item => item.variable === 'const (Intercept)')?.coefficient || 0;

                const minX = Math.min(...xVals);
                const maxX = Math.max(...xVals);
                const lineX = [minX, maxX];
                const lineY = [intercept + coeff * minX, intercept + coeff * maxX];

                const traceLine = { x: lineX, y: lineY, mode: 'lines', type: 'scatter', name: 'Garis Regresi', line: { color: THEME.violet, width: 3 } };

                const layout = baseLayout(`Scatter Plot: ${x} vs ${yVar}`, {
                    xaxis: axisStyle(x),
                    yaxis: axisStyle(yVar),
                    margin: { l: 60, r: 30, b: 70, t: 50 }
                });
                Plotly.newPlot(divId, [traceScatter, traceLine], layout, PLOT_CONFIG);
            });
        }
    }
}

/* ===== Kontrol sumbu plot 3D (tukar posisi X / Y) ===== */
function currentCamera() {
    const gd = document.getElementById('plotContainer');
    const cam = gd && gd.layout && gd.layout.scene && gd.layout.scene.camera;
    return cam ? JSON.parse(JSON.stringify(cam)) : JSON.parse(JSON.stringify(DEFAULT_CAMERA));
}

function setupAxisControls(data) {
    const xVars = data.data_points.x_vars;
    const selX = document.getElementById('axisXSelect');
    const selY = document.getElementById('axisYSelect');
    const zField = document.getElementById('axisZField');
    const fill = (sel, value) => {
        sel.innerHTML = '';
        xVars.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            sel.appendChild(opt);
        });
        sel.value = value;
    };
    fill(selX, axisOrder.x);
    fill(selY, axisOrder.y);
    zField.value = data.data_points.y_var;

    const redraw = () => renderPlots(analysisData);
    // Jika satu sumbu diganti dengan variabel yang sedang dipakai sumbu lain, keduanya saling tukar
    selX.onchange = () => {
        if (selX.value === axisOrder.y) axisOrder.y = axisOrder.x;
        axisOrder.x = selX.value;
        redraw();
    };
    selY.onchange = () => {
        if (selY.value === axisOrder.x) axisOrder.x = axisOrder.y;
        axisOrder.y = selY.value;
        redraw();
    };
    document.getElementById('axisSwapBtn').onclick = () => {
        axisOrder = { x: axisOrder.y, y: axisOrder.x };
        redraw();
    };
    document.getElementById('resetCameraBtn').onclick = () => {
        Plotly.relayout('plotContainer', { 'scene.camera': JSON.parse(JSON.stringify(DEFAULT_CAMERA)) });
    };
}

function setupSliders(data) {
    const sliderContainer = document.getElementById('sliderContainer');
    sliderContainer.className = 'slider-grid-vertical';
    sliderContainer.innerHTML = '';
    const xVars = data.data_points.x_vars;
    const means = data.means;

    xVars.forEach(x => {
        const meanVal = means[x] !== undefined ? means[x] : 0;
        const card = document.createElement('div');
        card.className = 'slider-card-vertical';
        card.innerHTML = `
            <div class="slider-head">
                <label for="range_${x}">${x}</label>
                <span class="slider-val" id="val_${x}">${meanVal.toFixed(2)}</span>
            </div>
            <input type="range" id="range_${x}" min="${meanVal * 0.5}" max="${meanVal * 1.5}" step="${meanVal * 0.01 || 0.1}" value="${meanVal}">
        `;
        sliderContainer.appendChild(card);
        document.getElementById(`range_${x}`).addEventListener('input', (e) => {
            document.getElementById(`val_${x}`).textContent = parseFloat(e.target.value).toFixed(2);
            calculatePrediction(data);
        });
    });
    calculatePrediction(data);
}

function calculatePrediction(data) {
    const xVars = data.data_points.x_vars;
    const intercept = data.summary_table.find(item => item.variable === 'const (Intercept)')?.coefficient || 0;
    
    let yPred = intercept;
    let eqParts = [`${intercept.toFixed(4)}`];

    xVars.forEach(x => {
        const rangeEl = document.getElementById(`range_${x}`);
        if (rangeEl) {
            const val = parseFloat(rangeEl.value);
            const coef = data.summary_table.find(item => item.variable === x)?.coefficient || 0;
            yPred += coef * val;
            const sign = coef >= 0 ? ' + ' : ' - ';
            eqParts.push(`${sign}${Math.abs(coef).toFixed(5)}(${x})`);
        }
    });

    // Update predicted Y value
    document.getElementById('predictedYVal').textContent = yPred.toFixed(4);

    // Update live equation text cleanly
    const eqContainer = document.getElementById('liveEquationVal');
    if (eqContainer) {
        eqContainer.innerHTML = `Ŷ = ${eqParts.join('')}`;
    }

    // Calculate and display R (Multiple Correlation Coefficient)
    const rVal = Math.sqrt(Math.max(0, parseFloat(data.r_squared) || 0));
    const rContainer = document.getElementById('liveRVal');
    if (rContainer) {
        rContainer.innerHTML = `Koefisien Korelasi Berganda (R) = <strong>${rVal.toFixed(4)}</strong> (dari R² = ${data.r_squared})`;
    }
}

function renderCalculationTable(calc) {
    const table = document.getElementById('calcTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    let headerRow = '<tr>';
    calc.columns.forEach(col => headerRow += `<th>${col}</th>`);
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    calc.data.forEach(row => {
        let rowHtml = '<tr>';
        calc.columns.forEach(col => {
            rowHtml += `<td>${row[col] !== undefined ? row[col] : '-'}</td>`;
        });
        rowHtml += '</tr>';
        tbody.innerHTML += rowHtml;
    });
}

function renderCorrelationHeatmap(corr) {
    const keys = Object.keys(corr);
    const zValues = [];
    keys.forEach(rowKey => {
        const rowVals = [];
        keys.forEach(colKey => {
            rowVals.push(corr[rowKey][colKey]);
        });
        zValues.push(rowVals);
    });

    const textValues = zValues.map(row => row.map(val => val.toFixed(2)));

    const data = [{
        z: zValues,
        x: keys,
        y: keys,
        type: 'heatmap',
        colorscale: [[0, '#f87199'], [0.5, '#12162b'], [1, '#e3c488']],
        zmin: -1, zmax: 1,
        xgap: 3, ygap: 3,
        text: textValues,
        texttemplate: "%{text}",
        textfont: { size: 13, color: '#ffffff', family: 'JetBrains Mono, monospace' },
        hoverinfo: 'text',
        showscale: true,
        colorbar: { thickness: 12, outlinewidth: 0, tickfont: { color: THEME.text } }
    }];

    const layout = baseLayout('Matriks Korelasi', {
        xaxis: Object.assign(axisStyle(''), { tickangle: -30, showgrid: false }),
        yaxis: Object.assign(axisStyle(''), { showgrid: false, autorange: 'reversed' }),
        margin: { l: 90, r: 20, b: 80, t: 50 }
    });

    Plotly.newPlot('heatmapContainer', data, layout, PLOT_CONFIG);
}

function renderDescStats(stats) {
    const table = document.getElementById('descTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const cols = Object.keys(stats);
    const statNames = Object.keys(stats[cols[0]]);

    let headerRow = '<tr><th>Statistik</th>';
    cols.forEach(c => headerRow += `<th>${c}</th>`);
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    statNames.forEach(stat => {
        let rowHtml = `<tr><td><strong>${stat}</strong></td>`;
        cols.forEach(col => {
            rowHtml += `<td>${stats[col][stat] !== undefined ? stats[col][stat].toFixed(4) : '-'}</td>`;
        });
        rowHtml += '</tr>';
        tbody.innerHTML += rowHtml;
    });
}
