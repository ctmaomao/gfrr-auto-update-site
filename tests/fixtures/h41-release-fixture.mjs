export function fixture(release = 'November 19, 2026', obs = 'Nov 18, 2026') {
  return `<!doctype html><html><body><div class="dates">Release Date: ${release}</div>
<!-- BEGIN DATA HERE -->
<p>1. Factors Affecting Reserve Balances of Depository Institutions (continued)</p>
<p><span>Millions</span> of dollars</p>
<table><thead>
<tr><td id="r" rowspan="3">Label</td><td id="avg" colspan="3">Averages of daily figures</td><td id="point" rowspan="3">Wednesday<br>${obs}</td></tr>
<tr><td id="week" rowspan="2">Week ended<br>${obs}</td><td id="change" colspan="2">Change from week ended</td></tr>
<tr><td id="chg1">Nov 11, 2026</td><td id="chg2">Nov 19, 2025</td></tr>
</thead><tbody>
<tr><td id="baseR">Currency</td></tr>
<tr id="reserve"><td>Reserve balances with Federal Reserve Banks</td><td header="baseR avg week ">&#xa0;2,979,656</td><td header="baseR avg change chg1">+19,053</td><td header="baseR avg change chg2">+91,013</td><td header="baseR point ">3,001,790</td></tr>
</tbody></table>
<p>5. Consolidated Statement of Condition of All Federal Reserve Banks</p>
<p>Millions of dollars</p>
<table><thead>
<tr><td id="assetLabel" rowspan="3">Assets, liabilities, and capital</td><td id="elim" rowspan="3">Eliminations from consolidation</td><td id="stock" rowspan="3">Wednesday<br>${obs}</td><td id="delta" colspan="2">Change since</td></tr>
<tr><td id="day1">Wednesday</td><td id="day2">Wednesday</td></tr>
<tr><td id="date1">Nov 11, 2026</td><td id="date2">Nov 19, 2025</td></tr>
</thead><tbody>
<tr><td id="baseA">Assets</td></tr>
<tr id="assets"><td>Total assets</td><td header="baseA elim">(0)</td><td header="baseA stock">6,741,452</td><td header="baseA delta day1 date1">-17,415</td><td header="baseA delta day2 date2">+186,169</td></tr>
</tbody></table>
<p>5. Consolidated Statement of Condition of All Federal Reserve Banks (continued)</p>
<p>Millions of dollars</p>
<table><tr><td>Total assets</td><td>7,000,000</td></tr></table>
<!-- END DATA HERE --></body></html>`;
}
