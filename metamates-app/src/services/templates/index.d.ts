export interface Template {
    id: string;
    name: string;
    category: 'daily' | 'review' | 'project' | 'weekly';
    description: string;
    content: string;
}
export declare const TEMPLATES: Record<string, Template>;
export declare function getTemplate(templateId: string): Template | undefined;
export declare function getTemplatesByCategory(category: Template['category']): Template[];
export declare function getAllTemplates(): Template[];
export declare function applyTemplate(templateId: string, variables: Record<string, string>): string;
