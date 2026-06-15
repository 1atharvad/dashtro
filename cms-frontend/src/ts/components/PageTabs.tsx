import { ReactNode } from 'react';
import { Tabs } from 'advi-ui';

export const PageTabs = ({tab}: {
  tab: { tabName: string; tabContent: ReactNode }[]
}) => {
  return (
    <Tabs
      tabs={tab.map((t, i) => ({
        value: String(i),
        label: t.tabName,
        content: t.tabContent,
      }))}
      defaultValue="0"
    />
  );
}
