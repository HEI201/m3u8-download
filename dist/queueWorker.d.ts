import Task from './index';
export default class QueueWorker {
    idx: number;
    segment: any;
    task: Task;
    catch: () => void;
    constructor({ segment, idx, task }: {
        segment?: any;
        idx?: number;
        task: Task;
    });
    downloadSeg(): Promise<void>;
}
