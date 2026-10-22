import os
from flask import Flask, render_template, request, jsonify
import pandas as pd
import numpy as np

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

current_df = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    global current_df
    if 'file' not in request.files:
        return jsonify({'error': 'Tidak ada file yang diunggah'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nama file kosong'}), 400
    if file and file.filename.endswith('.csv'):
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(filepath)
        try:
            current_df = pd.read_csv(filepath)
            columns = current_df.columns.tolist()
            return jsonify({'columns': columns, 'filename': file.filename, 'data': current_df.to_dict(orient='records')})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify({'error': 'Format file harus CSV'}), 400

@app.route('/update_data', methods=['POST'])
def update_data():
    global current_df
    req = request.json
    rows = req.get('rows', [])
    if not rows:
        return jsonify({'error': 'Data kosong'}), 400
    try:
        current_df = pd.DataFrame(rows)
        return jsonify({'success': True, 'columns': current_df.columns.tolist()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze():
    global current_df
    if current_df is None:
        return jsonify({'error': 'Belum ada data yang dimuat'}), 400
    
    data = request.json
    y_var = data.get('y')
    x_vars = data.get('x', [])
    
    if not y_var or not x_vars:
        return jsonify({'error': 'Variabel Y dan X harus dipilih'}), 400
    
    try:
        df_clean = current_df[[y_var] + x_vars].dropna()
        y = df_clean[y_var].values
        n = len(y)
        k = len(x_vars)
        
        desc_stats = df_clean.describe().to_dict()
        corr_matrix = df_clean.corr().to_dict()
        
        means = df_clean.mean().to_dict()
        y_mean = means[y_var]
        
        calc_rows = []
        covariance_summary = None
        manual_explanation = ""
        
        if k == 1:
            x_col = x_vars[0]
            x = df_clean[x_col].values
            x_mean = means[x_col]
            x_diff = x - x_mean
            y_diff = y - y_mean
            x_sq = x_diff ** 2
            y_sq = y_diff ** 2
            x_std = np.std(x, ddof=1) if n > 1 else 1
            y_std = np.std(y, ddof=1) if n > 1 else 1
            zx = x_diff / x_std if x_std != 0 else np.zeros_like(x)
            zy = y_diff / y_std if y_std != 0 else np.zeros_like(y)
            zx_zy = zx * zy
            
            sum_prod = np.sum(x_diff * y_diff)
            sum_sq_x = np.sum(x_sq)
            
            beta_1 = sum_prod / sum_sq_x if sum_sq_x != 0 else 0
            beta_0 = y_mean - beta_1 * x_mean
            
            y_pred = beta_0 + beta_1 * x
            residuals = y - y_pred
            residuals_sq = residuals ** 2
            
            for i in range(n):
                calc_rows.append({
                    "No": i + 1,
                    x_col: round(float(x[i]), 4),
                    y_var: round(float(y[i]), 4),
                    f"{x_col} min rata": round(float(x_diff[i]), 4),
                    f"{x_col} kuadrat": round(float(x_sq[i]), 4),
                    f"{y_var} min rata": round(float(y_diff[i]), 4),
                    f"{y_var} kuadrat": round(float(y_sq[i]), 4),
                    "Zx": round(float(zx[i]), 4),
                    "Zy": round(float(zy[i]), 4),
                    "Zx.Zy": round(float(zx_zy[i]), 4),
                    "y_pred (a+bx)": round(float(y_pred[i]), 4),
                    "residual (e)": round(float(residuals[i]), 4),
                    "e^2": round(float(residuals_sq[i]), 4)
                })
            
            calc_rows.append({
                "No": "Rata-rata / Var",
                x_col: round(float(x_mean), 4),
                y_var: round(float(y_mean), 4),
                f"{x_col} min rata": round(float(np.sum(x_diff)), 4),
                f"{x_col} kuadrat": round(float(np.var(x, ddof=1)), 4),
                f"{y_var} min rata": round(float(np.sum(y_diff)), 4),
                f"{y_var} kuadrat": round(float(np.var(y, ddof=1)), 4),
                "Zx": round(float(np.sum(zx)), 4),
                "Zy": round(float(np.sum(zy)), 4),
                "Zx.Zy": round(float(np.sum(zx_zy) / (n - 1)) if n > 1 else 0, 4),
                "y_pred (a+bx)": round(float(np.sum(y_pred)), 4),
                "residual (e)": round(float(np.sum(residuals)), 4),
                "e^2": round(float(np.sum(residuals_sq)), 4)
            })
            
            summary_table = [
                {"variable": "const (Intercept)", "coefficient": round(float(beta_0), 4), "std_error": "-", "t_value": "-", "p_value": "-"},
                {"variable": x_col, "coefficient": round(float(beta_1), 4), "std_error": "-", "t_value": "-", "p_value": "-"}
            ]
            regression_type = "Single Linear Regression (Format Excel Manual)"
            
            sum_sq_x_str = f"{sum_sq_x:.4f}"
            sum_prod_str = f"{sum_prod:.4f}"
            x_mean_str = f"{x_mean:.4f}"
            y_mean_str = f"{y_mean:.4f}"
            beta_1_str = f"{beta_1:.5f}"
            beta_0_str = f"{beta_0:.5f}"
            
            manual_explanation = f"""
            <h3>Panduan Langkah Perhitungan Manual (Single Linear Regression)</h3>
            <p>Untuk menghitung koefisien regresi &beta;&#8321; (untuk <b>{x_col}</b>) dan intercept &beta;&#8320; menggunakan ringkasan tabel di atas:</p>
            <ol>
                <li><b>Identifikasi Input Utama:</b>
                    <ul>
                        <li>&Sigma;(x - x&#772;)&sup2; ({x_col} kuadrat SS) = <b>{sum_sq_x_str}</b></li>
                        <li>&Sigma;(x - x&#772;)(y - y&#772;) (Product sum) = <b>{sum_prod_str}</b></li>
                        <li>Rata-rata x&#772; = <b>{x_mean_str}</b>, Rata-rata y&#772; = <b>{y_mean_str}</b></li>
                    </ul>
                </li>
                <li><b>Hitung Koefisien Kemiringan (Slope &beta;&#8321;):</b><br>
                &beta;&#8321; = &Sigma;(x - x&#772;)(y - y&#772;) / &Sigma;(x - x&#772;)&sup2; = {sum_prod_str} / {sum_sq_x_str} &approx; <b>{beta_1_str}</b></li>
                <li><b>Hitung Intercept (&beta;&#8320;):</b><br>
                &beta;&#8320; = y&#772; - &beta;&#8321;x&#772; = {y_mean_str} - ({beta_1_str} &times; {x_mean_str}) &approx; <b>{beta_0_str}</b></li>
            </ol>
            <p><b>Persamaan Regresi Akhir:</b><br>
            &Ycirc; = {beta_0_str} + {beta_1_str}({x_col})</p>
            """
            
        else:
            X_design = np.column_stack([np.ones(n)] + [df_clean[col].values for col in x_vars])
            XT = X_design.T
            XTX = XT @ X_design
            
            try:
                XTX_inv = np.linalg.inv(XTX)
            except np.linalg.LinAlgError:
                return jsonify({'error': 'Matriks singular (terdapat multikolinearitas sempurna pada variabel X).'}), 400
                
            XTy = XT @ y
            beta = XTX_inv @ XTy
            
            y_pred = X_design @ beta
            residuals = y - y_pred
            residuals_sq = residuals ** 2
            
            var_names = ["const (Intercept)"] + x_vars
            residual_variance = np.sum(residuals**2) / (n - k - 1) if (n - k - 1) > 0 else 0
            try:
                var_covar = residual_variance * XTX_inv
                std_errors = np.sqrt(np.diagonal(var_covar))
                t_values = beta / std_errors
            except:
                std_errors = [0] * len(beta)
                t_values = [0] * len(beta)
                
            summary_table = []
            for idx, name in enumerate(var_names):
                summary_table.append({
                    "variable": name,
                    "coefficient": round(float(beta[idx]), 4),
                    "std_error": round(float(std_errors[idx]), 4) if isinstance(std_errors, np.ndarray) else "-",
                    "t_value": round(float(t_values[idx]), 4) if isinstance(t_values, np.ndarray) else "-",
                    "p_value": "-"
                })
            
            cov_df = df_clean.cov()
            covariance_summary = {
                "cov_matrix": cov_df.round(4).to_dict()
            }

            for i in range(n):
                row_data = {"No": i + 1}
                for col in [y_var] + x_vars:
                    val = df_clean[col].values[i]
                    m = means[col]
                    diff = val - m
                    row_data[col] = round(float(val), 4)
                    row_data[f"{col} - mean"] = round(float(diff), 4)
                    row_data[f"{col}^2 (SS)"] = round(float(diff ** 2), 4)
                
                for idx_i, v_i in enumerate(x_vars):
                    diff_i = df_clean[v_i].values[i] - means[v_i]
                    diff_y = df_clean[y_var].values[i] - means[y_var]
                    row_data[f"({v_i}-mean)*({y_var}-mean)"] = round(float(diff_i * diff_y), 4)
                    
                    for idx_j in range(idx_i + 1, len(x_vars)):
                        v_j = x_vars[idx_j]
                        diff_j = df_clean[v_j].values[i] - means[v_j]
                        row_data[f"({v_i}-mean)*({v_j}-mean)"] = round(float(diff_i * diff_j), 4)

                row_data["y_pred"] = round(float(y_pred[i]), 4)
                row_data["residual (e)"] = round(float(residuals[i]), 4)
                row_data["e^2"] = round(float(residuals_sq[i]), 4)
                calc_rows.append(row_data)

            summary_row = {"No": "Sum / Covariance"}
            for col in [y_var] + x_vars:
                diffs = df_clean[col].values - means[col]
                summary_row[col] = round(float(means[col]), 4)
                summary_row[f"{col} - mean"] = round(float(np.sum(diffs)), 4)
                summary_row[f"{col}^2 (SS)"] = round(float(np.sum(diffs**2)), 4)

            for idx_i, v_i in enumerate(x_vars):
                diff_i = df_clean[v_i].values - means[v_i]
                diff_y = df_clean[y_var].values - means[y_var]
                summary_row[f"({v_i}-mean)*({y_var}-mean)"] = round(float(np.sum(diff_i * diff_y)), 4)
                for idx_j in range(idx_i + 1, len(x_vars)):
                    v_j = x_vars[idx_j]
                    diff_j = df_clean[v_j].values - means[v_j]
                    summary_row[f"({v_i}-mean)*({v_j}-mean)"] = round(float(np.sum(diff_j)), 4) # fixed notation

            summary_row["y_pred"] = round(float(np.sum(y_pred)), 4)
            summary_row["residual (e)"] = round(float(np.sum(residuals)), 4)
            summary_row["e^2"] = round(float(np.sum(residuals_sq)), 4)
            calc_rows.append(summary_row)

            regression_type = f"Multiple Linear Regression ({k} Variabel X - Metode Covariance & SSCP)"
            
            if k == 2:
                x1, x2 = x_vars[0], x_vars[1]
                ss1 = np.sum((df_clean[x1] - means[x1])**2)
                ss2 = np.sum((df_clean[x2] - means[x2])**2)
                sp12 = np.sum((df_clean[x1] - means[x1]) * (df_clean[x2] - means[x2]))
                sp1y = np.sum((df_clean[x1] - means[x1]) * (df_clean[y_var] - means[y_var]))
                sp2y = np.sum((df_clean[x2] - means[x2]) * (df_clean[y_var] - means[y_var]))
                
                denom = (ss1 * ss2) - (sp12**2)
                b1_val = beta[1]
                b2_val = beta[2]
                b0_val = beta[0]
                
                ss1_str = f"{ss1:.4f}"
                ss2_str = f"{ss2:.4f}"
                sp12_str = f"{sp12:.4f}"
                sp1y_str = f"{sp1y:.4f}"
                sp2y_str = f"{sp2y:.4f}"
                denom_str = f"{denom:.4f}"
                b1_str = f"{b1_val:.5f}"
                b2_str = f"{b2_val:.5f}"
                b0_str = f"{b0_val:.4f}"
                m1_str = f"{means[x1]:.4f}"
                m2_str = f"{means[x2]:.4f}"
                ym_str = f"{y_mean:.4f}"
                
                manual_explanation = f"""
                <h3>Panduan Langkah Perhitungan Manual (Multiple Linear Regression dengan 2 Variabel X)</h3>
                <p>Untuk menghitung koefisien &beta;&#8321; (untuk <b>{x1}</b>) dan &beta;&#8322; (untuk <b>{x2}</b>) menggunakan baris <i>Sum / Covariance</i> pada tabel di atas:</p>
                <ol>
                    <li><b>Identifikasi Input (Jumlah Kuadrat & Perkalian Silang):</b>
                        <ul>
                            <li>&Sigma;x&#8321;&sup2; ({x1}&sup2; SS) = <b>{ss1_str}</b></li>
                            <li>&Sigma;x&#8322;&sup2; ({x2}&sup2; SS) = <b>{ss2_str}</b></li>
                            <li>&Sigma;x&#8321;x&#8322; ({x1}-mean &times; {x2}-mean SP) = <b>{sp12_str}</b></li>
                            <li>&Sigma;x&#8321;y ({x1}-mean &times; {y_var}-mean SP) = <b>{sp1y_str}</b></li>
                            <li>&Sigma;x&#8322;y ({x2}-mean &times; {y_var}-mean SP) = <b>{sp2y_str}</b></li>
                        </ul>
                    </li>
                    <li><b>Hitung Penyebut Bersama (Denominator):</b><br>
                    Denominator = (&Sigma;x&#8321;&sup2; &times; &Sigma;x&#8322;&sup2;) - (&Sigma;x&#8321;x&#8322;)&sup2; = ({ss1_str} &times; {ss2_str}) - ({sp12_str})&sup2; = <b>{denom_str}</b></li>
                    <li><b>Hitung Koefisien &beta;&#8321; ({x1}):</b><br>
                    &beta;&#8321; = [(&Sigma;x&#8322;&sup2; &times; &Sigma;x&#8321;y) - (&Sigma;x&#8321;x&#8322; &times; &Sigma;x&#8322;y)] / Denominator<br>
                    &beta;&#8321; = [({ss2_str} &times; {sp1y_str}) - ({sp12_str} &times; {sp2y_str})] / {denom_str} &approx; <b>{b1_str}</b></li>
                    <li><b>Hitung Koefisien &beta;&#8322; ({x2}):</b><br>
                    &beta;&#8322; = [(&Sigma;x&#8321;&sup2; &times; &Sigma;x&#8322;y) - (&Sigma;x&#8321;x&#8322; &times; &Sigma;x&#8321;y)] / Denominator<br>
                    &beta;&#8322; = [({ss1_str} &times; {sp2y_str}) - ({sp12_str} &times; {sp1y_str})] / {denom_str} &approx; <b>{b2_str}</b></li>
                    <li><b>Hitung Intercept &beta;&#8320; (Konstanta):</b><br>
                    &beta;&#8320; = y&#772; - &beta;&#8321;x&#772;&#8321; - &beta;&#8322;x&#772;&#8322;<br>
                    &beta;&#8320; = {ym_str} - ({b1_str} &times; {m1_str}) - ({b2_str} &times; {m2_str}) &approx; <b>{b0_str}</b></li>
                </ol>
                <p><b>Persamaan Regresi Akhir:</b><br>
                &Ycirc; = {b0_str} + {b1_str}({x1}) + {b2_str}({x2})</p>
                """
            else:
                manual_explanation = f"""
                <h3>Panduan Perhitungan Multiple Linear Regression ({k} Variabel X)</h3>
                <p>Untuk jumlah variabel X > 2, perhitungan koefisien &beta; diselesaikan melalui perkalian matriks normal equations: &beta; = (X<sup>T</sup>X)<sup>-1</sup>X<sup>T</sup>y yang bersumber dari tabel Varians-Kovarians dan SSCP di atas.</p>
                """
            
        ss_res = np.sum(residuals**2)
        ss_tot = np.sum((y - np.mean(y))**2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        adj_r_squared = 1 - ((1 - r_squared) * (n - 1) / (n - k - 1)) if (n - k - 1) > 0 else r_squared
        
        calc_df = pd.DataFrame(calc_rows)
        
        response = {
            "regression_type": regression_type,
            "r_squared": round(float(r_squared), 4),
            "adj_r_squared": round(float(adj_r_squared), 4),
            "summary_table": summary_table,
            "desc_stats": desc_stats,
            "corr_matrix": corr_matrix,
            "covariance_summary": covariance_summary,
            "manual_explanation": manual_explanation,
            "x_count": k,
            "calculation_table": {
                "columns": calc_df.columns.tolist(),
                "data": calc_df.to_dict(orient='records')
            },
            "data_points": {
                "x_vars": x_vars,
                "y_var": y_var,
                "values": df_clean.to_dict(orient='list')
            },
            "means": means
        }
        
        if k == 2:
            x1, x2 = x_vars[0], x_vars[1]
            x1_vals = np.linspace(df_clean[x1].min(), df_clean[x1].max(), 20)
            x2_vals = np.linspace(df_clean[x2].min(), df_clean[x2].max(), 20)
            X1_grid, X2_grid = np.meshgrid(x1_vals, x2_vals)
            b0 = summary_table[0]['coefficient']
            b1 = summary_table[1]['coefficient']
            b2 = summary_table[2]['coefficient']
            Y_grid = b0 + b1 * X1_grid + b2 * X2_grid
            response['plane_3d'] = {
                "x1_name": x1,
                "x2_name": x2,
                "x1_grid": X1_grid.tolist(),
                "x2_grid": X2_grid.tolist(),
                "y_grid": Y_grid.tolist()
            }
            
        return jsonify(response)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
