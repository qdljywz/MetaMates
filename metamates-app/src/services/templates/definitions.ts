export interface Template {
  id: string
  name: string
  description: string
  category: 'daily' | 'project' | 'report'
  content: string
  variables?: string[]
}

export interface TemplateVariables {
  [key: string]: any
}
