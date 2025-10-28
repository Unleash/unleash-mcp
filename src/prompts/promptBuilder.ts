/**
 * Prompt Builder Utilities
 *
 * Helper functions for building well-formatted markdown prompts for MCP.
 * These utilities help create consistent, readable prompt content.
 */

/**
 * Create a formatted section header
 */
export function section(title: string, level: number = 2): string {
  const prefix = '#'.repeat(level);
  return `${prefix} ${title}\n\n`;
}

/**
 * Create a formatted subsection with content
 */
export function subsection(title: string, content: string, level: number = 3): string {
  return `${section(title, level)}${content}\n\n`;
}

/**
 * Create a formatted list
 */
export function list(items: string[], ordered: boolean = false): string {
  return items.map((item, index) => {
    const prefix = ordered ? `${index + 1}.` : '-';
    return `${prefix} ${item}`;
  }).join('\n') + '\n\n';
}

/**
 * Create a formatted code block
 */
export function codeBlock(code: string, language: string = ''): string {
  return `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
}

/**
 * Create a formatted inline code
 */
export function inlineCode(text: string): string {
  return `\`${text}\``;
}

/**
 * Create a formatted alert box
 */
export function alert(title: string, content: string, type: 'info' | 'warning' | 'danger' | 'success' = 'info'): string {
  const emoji = {
    info: 'ℹ️',
    warning: '⚠️',
    danger: '🚨',
    success: '✅',
  }[type];

  return `${emoji} **${title}**\n\n${content}\n\n`;
}

/**
 * Create a formatted divider
 */
export function divider(): string {
  return '═══════════════════════════════════════════════════════════════\n\n';
}

/**
 * Create a formatted table
 */
export function table(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map(row => `| ${row.join(' | ')} |`).join('\n');

  return `${headerRow}\n${separatorRow}\n${dataRows}\n\n`;
}

/**
 * Create a formatted example with code and explanation
 */
export function example(scenario: string, code: string, explanation: string, language: string = ''): string {
  return `**Scenario**: ${scenario}\n\n${codeBlock(code, language)}**Explanation**: ${explanation}\n\n`;
}

/**
 * Create a formatted decision tree
 */
export function decisionTree(decisions: Array<{ condition: string; result: string; reasoning: string }>): string {
  return decisions.map(d =>
    `**IF** ${d.condition}\n→ **THEN** ${d.result}\n*Reasoning*: ${d.reasoning}\n`
  ).join('\n') + '\n';
}

/**
 * Create a formatted workflow with numbered steps
 */
export function workflow(title: string, steps: Array<{ step: string; details?: string }>): string {
  let result = `${section(title, 3)}`;

  steps.forEach((s, index) => {
    result += `**Step ${index + 1}: ${s.step}**\n`;
    if (s.details) {
      result += `${s.details}\n`;
    }
    result += '\n';
  });

  return result;
}

/**
 * Create a formatted JSON output schema
 */
export function jsonSchema(schema: Record<string, unknown>): string {
  return codeBlock(JSON.stringify(schema, null, 2), 'json');
}

/**
 * Create a formatted reference link
 */
export function link(text: string, url: string): string {
  return `[${text}](${url})`;
}

/**
 * Create a formatted emphasis block
 */
export function emphasis(content: string, type: 'bold' | 'italic' | 'bold-italic' = 'bold'): string {
  const markers = {
    'bold': '**',
    'italic': '*',
    'bold-italic': '***',
  }[type];

  return `${markers}${content}${markers}`;
}

/**
 * Create a formatted blockquote
 */
export function blockquote(content: string): string {
  return content.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
}

/**
 * Wrap content in a collapsible section (if supported)
 */
export function collapsible(summary: string, content: string): string {
  return `<details>
<summary>${summary}</summary>

${content}
</details>\n\n`;
}

/**
 * Create a formatted checklist
 */
export function checklist(items: Array<{ text: string; checked?: boolean }>): string {
  return items.map(item => {
    const checkbox = item.checked ? '[x]' : '[ ]';
    return `- ${checkbox} ${item.text}`;
  }).join('\n') + '\n\n';
}

/**
 * Create a formatted horizontal rule
 */
export function hr(): string {
  return '---\n\n';
}

/**
 * Build a complete prompt from sections
 */
export function buildPrompt(sections: Array<{ title?: string; content: string }>): string {
  return sections.map(s => {
    if (s.title) {
      return `${section(s.title, 2)}${s.content}`;
    }
    return s.content;
  }).join('\n');
}
