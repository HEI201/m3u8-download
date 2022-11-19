import Task from './index';
export default class QueueWorker {
    idx: number;
    segment: any;
    task: Task;
    constructor({ segment, idx, task }: {
        segment?: any;
        idx?: number;
        task: Task;
    });
    downloadSegment(): Promise<void>;
}
