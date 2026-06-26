import type { FileInfo } from '../../types/electron';
export interface MasterControl {
    version: string;
    lastUpdated: number;
    projects: Project[];
    context: ContextSummary;
    status: 'active' | 'archived' | 'pending';
}
export interface Project {
    id: string;
    name: string;
    status: 'active' | 'completed' | 'on-hold';
    startDate: number;
    endDate?: number;
    description: string;
    tasks: Task[];
    relatedFiles: string[];
}
export interface Task {
    id: string;
    title: string;
    status: 'todo' | 'in-progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
    dueDate?: number;
    tags: string[];
}
export interface ContextSummary {
    totalProjects: number;
    activeProjects: number;
    totalTasks: number;
    completedTasks: number;
    recentActivity: Activity[];
}
export interface Activity {
    type: 'project-created' | 'task-completed' | 'file-updated' | 'context-loaded';
    timestamp: number;
    description: string;
}
export declare class MasterControlService {
    private masterControl;
    loadMasterControl(workspacePath: string): Promise<MasterControl | null>;
    createMasterControl(workspacePath: string): Promise<MasterControl>;
    saveMasterControl(workspacePath: string, masterControl: MasterControl): Promise<boolean>;
    updateContext(workspacePath: string, files: FileInfo[]): Promise<void>;
    private discoverProjects;
    private parseProjectFromContent;
    private parseMasterControl;
    private formatMasterControl;
    getMasterControl(): MasterControl | null;
    addProject(workspacePath: string, project: Project): Promise<boolean>;
    updateProjectStatus(workspacePath: string, projectId: string, status: Project['status']): Promise<boolean>;
    updateTaskStatus(workspacePath: string, projectId: string, taskId: string, status: Task['status']): Promise<boolean>;
}
export declare const masterControlService: MasterControlService;
