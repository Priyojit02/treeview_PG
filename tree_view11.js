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

