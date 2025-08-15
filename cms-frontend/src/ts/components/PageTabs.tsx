import { Box, Tab } from '@mui/material';
import { TabContext, TabList, TabPanel } from '@mui/lab';
import { ReactNode, SyntheticEvent, useState } from 'react';

export const PageTabs = ({
  tab
}: {
  tab: {
    tabName: string,
    tabContent: ReactNode
  }[]
}) => {
  const [value, setValue] = useState(0);

  const handleChange = (_: SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: '100%', typography: 'body1' }}>
      <TabContext value={value}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <TabList onChange={handleChange} aria-label="Page Tabs">
            {tab.map(({tabName}, index: number) => (
              <Tab key={tabName} label={tabName} value={index} />
            ))}
          </TabList>
        </Box>
        {tab.map(({tabName, tabContent}, index: number) => (
          <TabPanel key={tabName} value={index}>{tabContent}</TabPanel>
        ))}
      </TabContext>
    </Box>
  );
}