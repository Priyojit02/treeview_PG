
// // import './App.css';

// // function App() {
// //   return (
// //     <div>Hello Wotld!
// //     </div>
// //   );
// // }

// // export default App;

// import * as React from 'react';
// import { Box, Card, CardContent, Typography, Divider } from '@mui/material';
// import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
// import ChevronRightIcon from '@mui/icons-material/ChevronRight';
// import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';

// const data = [
//   {
//     id: 'dept-1',
//     name: 'Engineering',
//     children: [
//       {
//         id: 'team-1',
//         name: 'Platform Team',
//         children: [
//           { id: 'emp-1', name: 'Alice (SDE)' },
//           { id: 'emp-2', name: 'Ravi (DevOps)' },
//         ],
//       },
//       {
//         id: 'team-2',
//         name: 'ML Team',
//         children: [
//           { id: 'emp-3', name: 'Fatima (ML Eng)' },
//           { id: 'emp-4', name: 'Ken (Data Eng)' },
//         ],
//       },
//     ],
//   },
//   {
//     id: 'dept-2',
//     name: 'Sales',
//     children: [
//       { id: 'emp-5', name: 'Priya (AE)' },
//       { id: 'emp-6', name: 'Diego (SDR)' },
//     ],
//   },
//   {
//     id: 'dept-3',
//     name: 'HR',
//     children: [
//       { id: 'emp-7', name: 'Mina (HRBP)' },
//       { id: 'emp-8', name: 'Omar (Recruiter)' },
//     ],
//   },
// ];

// function renderNode(node) {
//   const kids = node.children || [];
//   return (
//     <TreeItem
//       key={node.id}
//       itemId={node.id}
//       label={
//         <Box display="flex" alignItems="center" gap={1} py={0.25}>
//           <Typography variant="body2" fontWeight={600}>
//             {node.name}
//           </Typography>
//         </Box>
//       }
//       sx={{
//         '& .MuiTreeItem-content:hover': { backgroundColor: 'action.hover' },
//         '& .MuiTreeItem-content.Mui-focused, & .MuiTreeItem-content.Mui-selected, & .MuiTreeItem-content.Mui-selected.Mui-focused': {
//           backgroundColor: 'action.selected',
//         },
//       }}
//     >
//       {kids.map(renderNode)}
//     </TreeItem>
//   );
// }

// export default function App() {
//   return (
//     <Box
//       sx={{
//         minHeight: '100vh',
//         display: 'flex',
//         alignItems: 'center',
//         justifyContent: 'center',
//         p: 3,
//         bgcolor: '#f7f7fb',
//       }}
//     >
//       <Card sx={{ width: '100%', maxWidth: 720, borderRadius: 4, boxShadow: 6 }}>
//         <CardContent>
//           <Typography variant="h6" gutterBottom>
//             Org Structure (TreeView with Hover Highlight)
//           </Typography>
//           <Typography variant="body2" sx={{ mb: 1.5, opacity: 0.8 }}>
//             Hover over any row to highlight. Click nodes to expand/collapse.
//           </Typography>
//           <Divider sx={{ mb: 2 }} />
//           <SimpleTreeView
//             slots={{ collapseIcon: ExpandMoreIcon, expandIcon: ChevronRightIcon }}
//             defaultExpandedIds={['dept-1']}
//             sx={{
//               maxHeight: 420,
//               overflowY: 'auto',
//               px: 0.5,
//               '& .MuiTreeItem-group': (theme) => ({
//                 ml: 1.25,
//                 pl: 1.0,
//                 borderLeft: `1px dashed ${theme.palette.divider}`,
//               }),
//             }}
//           >
//             {data.map(renderNode)}
//           </SimpleTreeView>
//         </CardContent>
//       </Card>
//     </Box>
//   );
// }

import * as React from 'react';
import {
  Box, Card, CardContent, Typography, Divider, Stack, Button, TextField, Chip, useMediaQuery
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';

import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';

/** ───────────────────────── SAMPLE DATA (bigger) ───────────────────────── **/
const ORG = [
  {
    id: 'dept-eng',
    type: 'department',
    name: 'Engineering',
    children: [
      {
        id: 'team-platform',
        type: 'team',
        name: 'Platform Team',
        children: [
          { id: 'emp-a1', type: 'person', name: 'Alice (SDE)' },
          { id: 'emp-r2', type: 'person', name: 'Ravi (DevOps)' },
          { id: 'emp-j3', type: 'person', name: 'Jia (SRE)' },
        ],
      },
      {
        id: 'team-ml',
        type: 'team',
        name: 'ML Team',
        children: [
          { id: 'emp-f4', type: 'person', name: 'Fatima (ML Eng)' },
          { id: 'emp-k5', type: 'person', name: 'Ken (Data Eng)' },
          { id: 'emp-s6', type: 'person', name: 'Sonia (Scientist)' },
        ],
      },
      {
        id: 'team-fe',
        type: 'team',
        name: 'Frontend Build',
        children: [
          { id: 'emp-p7', type: 'person', name: 'Priya (React)' },
          { id: 'emp-d8', type: 'person', name: 'Diego (Design Systems)' },
        ],
      },
    ],
  },
  {
    id: 'dept-sales',
    type: 'department',
    name: 'Sales',
    children: [
      {
        id: 'team-enterprise',
        type: 'team',
        name: 'Enterprise',
        children: [
          { id: 'emp-l9', type: 'person', name: 'Liam (AE)' },
          { id: 'emp-e10', type: 'person', name: 'Elena (SDR)' },
        ],
      },
      {
        id: 'team-smb',
        type: 'team',
        name: 'SMB',
        children: [
          { id: 'emp-d11', type: 'person', name: 'Dev (AE)' },
          { id: 'emp-m12', type: 'person', name: 'Mina (SDR)' },
          { id: 'emp-o13', type: 'person', name: 'Omar (CSM)' },
        ],
      },
    ],
  },
  {
    id: 'dept-ops',
    type: 'department',
    name: 'Operations',
    children: [
      {
        id: 'team-hr',
        type: 'team',
        name: 'HR',
        children: [
          { id: 'emp-h14', type: 'person', name: 'Hannah (HRBP)' },
          { id: 'emp-r15', type: 'person', name: 'Rohit (Recruiter)' },
        ],
      },
      {
        id: 'team-fin',
        type: 'team',
        name: 'Finance',
        children: [
          { id: 'emp-a16', type: 'person', name: 'Aisha (Controller)' },
          { id: 'emp-b17', type: 'person', name: 'Ben (Analyst)' },
          { id: 'emp-c18', type: 'person', name: 'Chitra (AR)' },
        ],
      },
    ],
  },
];

/** ───────────────────────── utilities ───────────────────────── **/
const flattenIds = (nodes) => {
  const all = [];
  const walk = (n) => {
    all.push(n.id);
    (n.children || []).forEach(walk);
  };
  nodes.forEach(walk);
  return all;
};

const searchTree = (nodes, query) => {
  if (!query) return { data: nodes, expand: [] };
  const q = query.toLowerCase();

  const filterNode = (node) => {
    const kids = node.children || [];
    const filteredKids = kids.map(filterNode).filter(Boolean);

    const matchesSelf = node.name.toLowerCase().includes(q);
    if (matchesSelf || filteredKids.length) {
      return { ...node, children: filteredKids };
    }
    return null;
  };

  const filtered = nodes.map(filterNode).filter(Boolean);

  // expand all parents that have a match under them
  const expandIds = [];
  const collectParents = (node) => {
    if (node.children?.length) {
      expandIds.push(node.id);
      node.children.forEach(collectParents);
    }
  };
  filtered.forEach(collectParents);

  return { data: filtered, expand: expandIds };
};

const iconFor = (type) => {
  if (type === 'department') return <BusinessIcon fontSize="small" />;
  if (type === 'team') return <PeopleIcon fontSize="small" />;
  return <PersonIcon fontSize="small" />;
};

const chipColorFor = (type, theme) => {
  switch (type) {
    case 'department':
      return { bg: alpha(theme.palette.primary.main, 0.08), fg: theme.palette.primary.main };
    case 'team':
      return { bg: alpha(theme.palette.success.main, 0.1), fg: theme.palette.success.main };
    default:
      return { bg: alpha(theme.palette.info.main, 0.1), fg: theme.palette.info.main };
  }
};

/** ───────────────────────── Tree Item renderer ───────────────────────── **/
function RenderItem({ node }) {
  const kids = node.children || [];
  const theme = useTheme();
  const colors = chipColorFor(node.type, theme);

  return (
    <TreeItem
      key={node.id}
      itemId={node.id} // v8 API
      label={
        <Stack direction="row" alignItems="center" spacing={1}>
          {iconFor(node.type)}
          <Typography variant="body2" fontWeight={600}>
            {node.name}
          </Typography>
          {kids.length > 0 && (
            <Chip
              label={`${kids.length}`}
              size="small"
              sx={{
                height: 20,
                borderRadius: 1,
                bgcolor: colors.bg,
                color: colors.fg,
                '& .MuiChip-label': { px: 0.75, py: 0 },
              }}
            />
          )}
        </Stack>
      }
      sx={{
        // Row styling: hover/selected/focus
        '& .MuiTreeItem-content': {
          borderRadius: 1,
          pr: 0.5,
          transition: 'background-color 120ms ease',
        },
        '& .MuiTreeItem-content:hover': { backgroundColor: 'action.hover' },
        '& .MuiTreeItem-content.Mui-focused, & .MuiTreeItem-content.Mui-selected, & .MuiTreeItem-content.Mui-selected.Mui-focused': {
          backgroundColor: 'action.selected',
        },
        // Connector style
        '& .MuiTreeItem-group': (t) => ({
          ml: 1.25,
          pl: 1.0,
          borderLeft: `1px dashed ${t.palette.divider}`,
        }),
      }}
    >
      {kids.map((child) => (
        <RenderItem key={child.id} node={child} />
      ))}
    </TreeItem>
  );
}

/** ───────────────────────── Main App ───────────────────────── **/
export default function App() {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

  const [query, setQuery] = React.useState('');
  const [expandedIds, setExpandedIds] = React.useState(['dept-eng']);
  const [filtered, setFiltered] = React.useState({ data: ORG, expand: [] });

  // recompute filtered tree when query changes
  React.useEffect(() => {
    const res = searchTree(ORG, query);
    setFiltered(res);
    if (query) {
      setExpandedIds(res.expand); // auto-expand on search
    }
  }, [query]);

  const expandAll = () => setExpandedIds(flattenIds(ORG));
  const collapseAll = () => setExpandedIds([]);
  const reset = () => {
    setQuery('');
    setExpandedIds(['dept-eng']);
    setFiltered({ data: ORG, expand: [] });
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        p: { xs: 1.5, sm: 2, md: 4 },
        bgcolor: '#f7f7fb',
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: { xs: 520, sm: 720, md: 900 },
          borderRadius: 4,
          boxShadow: 6,
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant={isSmall ? 'h6' : 'h5'} gutterBottom>
            Org Structure (TreeView • Hover Highlight • Search)
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
            Type to filter; matched branches auto-expand. Hover highlights rows. Use the buttons to expand/collapse all.
          </Typography>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.25}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            sx={{ mb: 1.5 }}
          >
            <TextField
              size="small"
              placeholder="Search teams or people…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, opacity: 0.7 }} />,
              }}
              sx={{ flex: 1 }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<UnfoldMoreIcon />} onClick={expandAll}>
                Expand all
              </Button>
              <Button variant="outlined" startIcon={<UnfoldLessIcon />} onClick={collapseAll}>
                Collapse all
              </Button>
              <Button variant="contained" color="primary" onClick={reset}>
                Reset
              </Button>
            </Stack>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Box
            sx={{
              maxHeight: { xs: 360, sm: 440, md: 520 },
              overflowY: 'auto',
              px: 0.5,
              bgcolor: alpha(theme.palette.primary.light, 0.02),
              borderRadius: 2,
            }}
          >
            <SimpleTreeView
              slots={{ collapseIcon: ExpandMoreIcon, expandIcon: ChevronRightIcon }}
              expandedItems={expandedIds}
              onExpandedItemsChange={(_, ids) => setExpandedIds(ids)}
              defaultExpandedIds={['dept-eng']}
              sx={{
                '& .MuiTreeItem-content': {
                  py: 0.25,
                },
              }}
            >
              {(query ? filtered.data : ORG).map((node) => (
                <RenderItem key={node.id} node={node} />
              ))}
            </SimpleTreeView>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
