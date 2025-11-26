// helper: parse formatted strings to Number
const parseNumber = (s) => {
  if (s == null || s === "") return 0;
  const cleaned = String(s).replace(/[^0-9.-]+/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};
const transformFromBackend = (records = []) => {
  const walk = (r) => {
    const amountStr = fmtAmount(r.ReportingPeriodAmount);
    const compStr = fmtAmount(r.ComparisonPeriodAmount);
    const diffAbsStr = fmtAmount(r.AbsoluteDifferenceAmount);

    const amountNum = parseNumber(amountStr);
    const comparisonNum = parseNumber(compStr);
    const diffAbsNum = parseNumber(diffAbsStr);

    // Prefer reported amount when non-zero; if it's zero/empty, use diffAbs as display value
    const displayAmountNum = amountNum !== 0 ? amountNum : (diffAbsNum !== 0 ? diffAbsNum : amountNum);
    const displayAmountStr = displayAmountNum !== 0 ? new Intl.NumberFormat().format(displayAmountNum) : amountStr || diffAbsStr || "";

    return {
      id: r.HierarchyNode,
      kind: mapNodeType(r.NodeType),
      name: bestName(r),
      code: r.FinancialStatementItem,
      itemText: r.FinancialStatementItemText,
      account: r.OperativeGLAccount,
      accountName: r.OperativeGLAccountName,
      // original strings (keep for reference)
      amount: amountStr,
      comparison: compStr,
      diffAbs: diffAbsStr,
      // numeric fields
      amountNum,
      comparisonNum,
      diffAbsNum,
      // display fallback
      displayAmountNum,
      displayAmountStr,
      diffPct: fmtAmount(r.RelativeDifferencePercent),
      currency: r.Currency,
      level: r.FinStatementHierarchyLevelVal,
      children: (r.Children || []).map(walk),
    };
  };
  return (records || []).map(walk);
};
{(node.displayAmountStr || node.displayAmountNum) && (
  <Typography variant="caption" color="text.secondary">
    {node.displayAmountStr || (node.displayAmountNum !== 0 ? new Intl.NumberFormat().format(node.displayAmountNum) : "")}
    {node.currency ? ` ${node.currency}` : ""}
  </Typography>
)}
