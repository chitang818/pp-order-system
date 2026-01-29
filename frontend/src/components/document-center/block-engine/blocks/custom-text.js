/**
 * 自定义文本区块
 */
import { BaseBlock } from './base-block.js';

export class CustomTextBlock extends BaseBlock {
  static displayName = '自定义文本';
  static icon = '📝';
  static category = 'content';

  static getDefaultConfig() {
    return {
      text: '自定义文本内容',
      allowDataBinding: true,  // 是否允许数据绑定
      style: {
        fontSize: 11,
        textAlign: 'left',
        color: '#000000',
        lineHeight: 1.5
      }
    };
  }

  render(data) {
    const config = { ...CustomTextBlock.getDefaultConfig(), ...this.config };
    
    let text = config.text;
    
    // 如果允许数据绑定，解析{{变量}}格式
    if (config.allowDataBinding) {
      text = this.processDataBinding(text, data);
    }

    const style = this.getStyleString(config.style);

    return `
      <div class="block custom-text-block" style="${style}">
        ${text.replace(/\n/g, '<br/>')}
      </div>
    `;
  }

  /**
   * 处理数据绑定（简单的{{变量}}格式）
   */
  processDataBinding(text, data) {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, binding) => {
      const value = this.resolveBinding(binding.trim(), data);
      return value !== '' ? value : match;
    });
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'text',
        label: '文本内容',
        type: 'textarea'
      },
      {
        name: 'allowDataBinding',
        label: '允许数据绑定',
        type: 'boolean',
        description: '启用后可使用{{变量}}格式绑定数据'
      },
      {
        name: 'style.fontSize',
        label: '字体大小',
        type: 'number',
        min: 8,
        max: 24
      },
      {
        name: 'style.textAlign',
        label: '对齐方式',
        type: 'select',
        options: [
          { value: 'left', label: '左对齐' },
          { value: 'center', label: '居中' },
          { value: 'right', label: '右对齐' }
        ]
      }
    ];
  }
}

