const parseSAPNumber = (s) => {
  if (s === null || s === undefined || s === "") return 0;
  const str = String(s).trim();

  // parentheses format => negative
  if (/^\(.*\)$/.test(str)) {
    const cleaned = str.replace(/[(),]/g, "");
    return -Number(cleaned);
  }

  // general cleanup (remove commas, currency)
  const cleaned = str.replace(/[^0-9.-]/g, "");
  return Number(cleaned) || 0;
};
const transformFromBackend = (records = []) => {
  const walk = (r) => {
    const amountNum = parseSAPNumber(r.ReportingPeriodAmount);
    const comparisonNum = parseSAPNumber(r.ComparisonPeriodAmount);
    const diffNum = amountNum - comparisonNum;

    return {
      id: r.HierarchyNode,
      kind: mapNodeType(r.NodeType),
      name: bestName(r),

      code: r.FinancialStatementItem,
      itemText: r.FinancialStatementItemText,
      account: r.OperativeGLAccount,
      accountName: r.OperativeGLAccountName,

      amount: r.ReportingPeriodAmount,
      amountNum,
      comparison: r.ComparisonPeriodAmount,
      comparisonNum,

      diffAbs: r.AbsoluteDifferenceAmount,
      diffPct: r.RelativeDifferencePercent,
      diffNum,

      currency: r.Currency,
      level: r.FinStatementHierarchyLevelVal,

      children: (r.Children || []).map(walk),
    };
  };

  return records.map(walk);
};

<ResponsiveContainer>
  <BarChart
    data={preview.map((r) => ({
      name: r.name,
      diff: r.diffNum,
    }))}
    layout="vertical"
    margin={{ top: 10, right: 20, left: 40, bottom: 10 }}
  >
    <CartesianGrid strokeDasharray="3 3" />

    {/* Important: axis spans negative to positive */}
    <XAxis type="number" domain={["dataMin", "dataMax"]} />

    <YAxis type="category" dataKey="name" width={140} />

    {/* Zero line */}
    <ReferenceLine x={0} stroke="#666" strokeDasharray="3 3" />

    <ReTooltip formatter={(v) => v.toLocaleString()} />

    <Bar dataKey="diff" barSize={12}>
      {preview.map((r, i) => (
        <Cell
          key={i}
          fill={r.diffNum >= 0 ? "#4caf50" : "#f44336"}
        />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
