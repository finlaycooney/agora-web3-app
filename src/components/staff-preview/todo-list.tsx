'use client';

import { useState, type ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';

import { Badge } from '@/components/staff-ui/badge';
import { Button } from '@/components/staff-ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';
import { Checkbox } from '@/components/staff-ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/staff-ui/tabs';

import { CandidatePreviewLink } from './candidate-preview';

type TodoCategory = 'Review' | 'Interviews' | 'Notes';

interface DemoTask {
    id: string;
    category: TodoCategory;
    title: string;
    description: string;
    actionLabel: string;
    action: ReactNode;
}

const DEMO_TASKS: DemoTask[] = [
    {
        id: 'todo-review-alice',
        category: 'Review',
        title: 'Review Alice Chen',
        description: 'New Backend Engineer application · Atlas Network',
        actionLabel: 'Review candidate',
        action: (
            <CandidatePreviewLink
                candidateId="demo-02"
                className="rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
                Review candidate
            </CandidatePreviewLink>
        ),
    },
    {
        id: 'todo-interview-casey',
        category: 'Interviews',
        title: 'Prepare Casey Lin’s interview',
        description: 'Mobile Engineer · Atlas Network',
        actionLabel: 'View application',
        action: (
            <a
                href="#/applications?client=atlas&job=job-mobile&stage=Interview"
                className="rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
                View application
            </a>
        ),
    },
    {
        id: 'todo-notes-devon',
        category: 'Notes',
        title: 'Add screening notes for Devon Park',
        description: 'Full-stack Engineer · Northstar Labs',
        actionLabel: 'Add notes',
        action: (
            <a
                href="#/candidates/demo-08?tab=notes"
                className="rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
                Add notes
            </a>
        ),
    },
];

const CATEGORIES: Array<'all' | TodoCategory> = ['all', 'Review', 'Interviews', 'Notes'];

export function TodoList({
    completedTaskIDs,
    onToggleComplete,
}: {
    completedTaskIDs: string[];
    onToggleComplete: (id: string, completed: boolean) => void;
}) {
    const [category, setCategory] = useState<'all' | TodoCategory>('all');
    const [showCompleted, setShowCompleted] = useState(false);

    const openTasks = DEMO_TASKS.filter((task) => !completedTaskIDs.includes(task.id));
    const completedTasks = DEMO_TASKS.filter((task) => completedTaskIDs.includes(task.id));
    const pool = showCompleted ? completedTasks : openTasks;
    const visible = pool.filter((task) => category === 'all' || task.category === category);
    const countFor = (value: 'all' | TodoCategory) =>
        pool.filter((task) => value === 'all' || task.category === value).length;

    const emptyMessage = showCompleted
        ? 'No completed tasks in this view'
        : openTasks.length === 0
          ? 'You’re up to date'
          : 'No tasks in this category';

    return (
        <Card>
            <CardHeader className="gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary">
                            <ClipboardList
                                className="h-3.5 w-3.5 text-secondary-foreground"
                                aria-hidden="true"
                            />
                        </span>
                        To-do
                    </CardTitle>
                    <Button
                        variant="outline"
                        size="sm"
                        aria-pressed={showCompleted}
                        onClick={() => setShowCompleted((value) => !value)}
                    >
                        {showCompleted
                            ? `Showing completed (${completedTasks.length})`
                            : `Completed (${completedTasks.length})`}
                    </Button>
                </div>
                <p className="text-sm text-muted-foreground">Your next recruiting actions.</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <Tabs
                    value={category}
                    onValueChange={(value) => setCategory(value as 'all' | TodoCategory)}
                >
                    <TabsList aria-label="To-do categories" className="grid grid-cols-2 sm:flex">
                        {CATEGORIES.map((value) => (
                            <TabsTrigger key={value} value={value}>
                                {value === 'all' ? 'All' : value}
                                <Badge variant="secondary">{countFor(value)}</Badge>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {visible.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                        {emptyMessage}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {visible.map((task) => (
                            <li
                                key={task.id}
                                className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                            >
                                <div className="flex min-w-0 items-start gap-3">
                                    <Checkbox
                                        aria-label={
                                            showCompleted
                                                ? `Reopen ${task.title}`
                                                : `Mark ${task.title} complete`
                                        }
                                        checked={showCompleted}
                                        onCheckedChange={(checked) =>
                                            onToggleComplete(task.id, checked === true)
                                        }
                                        className="mt-0.5"
                                    />
                                    <div className="flex min-w-0 flex-col">
                                        <span
                                            className={
                                                showCompleted
                                                    ? 'text-sm font-medium text-muted-foreground line-through'
                                                    : 'text-sm font-medium text-foreground'
                                            }
                                        >
                                            {task.title}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {task.description}
                                        </span>
                                    </div>
                                </div>
                                <span className="shrink-0">{task.action}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
