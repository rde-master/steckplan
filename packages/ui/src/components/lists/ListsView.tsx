// Reiter „Listen“: Packliste und Kabelliste.
import { useState } from 'react';
import type { Library } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { FilterBar } from '../FilterBar';
import { Button } from '../ui';
import { CableListView } from './CableListView';
import { PackingListView } from './PackingListView';

export function ListsView(props: { projectId: string; data: ProjectData; library: Library | null; canCheck: boolean; canReset: boolean }) {
  const [list, setList] = useState<'packing' | 'cables'>('packing');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" role="tablist" aria-label={texts.lists.title}>
        <Button role="tab" aria-selected={list === 'packing'} variant={list === 'packing' ? 'primary' : 'ghost'} onClick={() => setList('packing')}>
          {texts.lists.packing}
        </Button>
        <Button role="tab" aria-selected={list === 'cables'} variant={list === 'cables' ? 'primary' : 'ghost'} onClick={() => setList('cables')}>
          {texts.lists.cables}
        </Button>
      </div>
      <FilterBar library={props.library} data={props.data} showColorMode={false} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list === 'packing' ? <PackingListView {...props} /> : <CableListView data={props.data} library={props.library} />}
      </div>
    </div>
  );
}
