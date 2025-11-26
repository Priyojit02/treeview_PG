// =================== Tree Item Renderer ===================
function RenderItem({ node, hoveredId, setHoveredId, selectedId, setSelectedId }) {
  const theme = useTheme();
  const kids = node.children || [];
  const colors = chipColorFor(node.kind, theme);
  const isHovered = hoveredId === node.id;
  const isSelected = selectedId === node.id;

  return (
    <TreeItem
      key={node.id}
      itemId={String(node.id)}
      label={
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          onMouseEnter={() => setHoveredId(node.id)}
          onMouseLeave={() => setHoveredId(null)}
          // ensure clicking anywhere on the label selects the node
          onClick={(e) => {
            // prevent TreeView's internal double-firing if needed:
            e.stopPropagation();
            setSelectedId(node.id);
          }}
          sx={{ cursor: "pointer" }}
        >
          {iconFor(node.kind)}
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography variant="body2" fontWeight={700}>
              {node.name}
            </Typography>
            {node.amount && (
              <Typography variant="caption" color="text.secondary">
                {node.amount} {node.currency || ""}
              </Typography>
            )}
          </Stack>
          {kids.length > 0 && (
            <Chip
              label={`${kids.length}`}
              size="small"
              sx={{
                height: 20,
                borderRadius: 1,
                bgcolor: colors.bg,
                color: colors.fg,
                "& .MuiChip-label": { px: 0.75, py: 0 },
              }}
            />
          )}
        </Stack>
      }
      sx={{
        "& .MuiTreeItem-content": {
          borderRadius: 1,
          pr: 0.5,
          transition: "background-color 120ms ease, box-shadow 120ms ease",
          ...(isHovered && {
            backgroundColor: alpha(theme.palette.primary.main, 0.06),
          }),
          ...(isSelected && {
            boxShadow: `inset 0 0 0 2px ${alpha(
              theme.palette.primary.main,
              0.35
            )}`,
          }),
        },
        "& .MuiTreeItem-content:hover": {
          backgroundColor: "action.hover",
        },
        "& .MuiTreeItem-group": {
          marginLeft: 1.25,
          paddingLeft: 1.0,
          borderLeft: `1px dashed ${theme.palette.divider}`,
        },
      }}
    >
      {kids.map((child) => (
        <RenderItem
          key={child.id}
          node={child}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
      ))}
    </TreeItem>
  );
}
