// Reiter „Listen“: Packliste, Kabelliste, DMX-Patch, Netzwerk und Änderungsprotokoll.
import { useState } from 'react';
import type { Library } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { FilterBar } from '../FilterBar';
import { Button } from '../ui';
import { CableListView } from './CableListView';
import { ChangeLogView } from './ChangeLogView';
import { PackingListView } from './PackingListView';
import { PeopleListView } from './PeopleListView';
import { DmxPatchView, NetworkListView } from './TechLists';

export function ListsView(props: { projectId: string; data: ProjectData; library: Library | null; canCheck: boolean; canReset: boolean }) {
  const [list, setList] = useState<'packing' | 'cables' | 'people' | 'dmx' | 'network' | 'changes'>('packing');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b *:shrink-0 border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" role="tablist" aria-label={texts.lists.title}>
        <Button role="tab" aria-selected={list === 'packing'} variant={list === 'packing' ? 'primary' : 'ghost'} onClick={() => setList('packing')}>
          {texts.lists.packing}
        </Button>
        <Button role="tab" aria-selected={list === 'cables'} variant={list === 'cables' ? 'primary' : 'ghost'} onClick={() => setList('cables')}>
          {texts.lists.cables}
        </Button>
        <Button role="tab" aria-selected={list === 'people'} variant={list === 'people' ? 'primary' : 'ghost'} onClick={() => setList('people')}>
          {texts.lists.people}
        </Button>
        <Button role="tab" aria-selected={list === 'dmx'} variant={list === 'dmx' ? 'primary' : 'ghost'} onClick={() => setList('dmx')}>
          {texts.lists.dmx}
        </Button>
        <Button role="tab" aria-selected={list === 'network'} variant={list === 'network' ? 'primary' : 'ghost'} onClick={() => setList('network')}>
          {texts.lists.network}
        </Button>
        <Button role="tab" aria-selected={list === 'changes'} variant={list === 'changes' ? 'primary' : 'ghost'} onClick={() => setList('changes')}>
          {texts.lists.changes}
        </Button>
      </div>
      {list !== 'changes' && <FilterBar library={props.library} data={props.data} showColorMode={false} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list === 'packing' ? (
          <PackingListView {...props} />
        ) : list === 'cables' ? (
          <CableListView data={props.data} library={props.library} />
        ) : list === 'people' ? (
          <PeopleListView data={props.data} library={props.library} />
        ) : list === 'changes' ? (
          <ChangeLogView projectId={props.projectId} />
        ) : list === 'dmx' ? (
          <DmxPatchView data={props.data} library={props.library} />
        ) : (
          <NetworkListView data={props.data} library={props.library} />
        )}
      </div>
    </div>
  );
}
