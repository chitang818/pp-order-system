/**
 * 空白区块
 */
import { BaseBlock } from './base-block.js';

export class SpacerBlock extends BaseBlock {
  static displayName = '空白';
  static icon = '⬜';
  static category = 'layout';

  static getDefaultConfig() {
    return {
      height: 20  // 空白高度（像素）
    };
  }

  render(data) {
    const config = { ...SpacerBlock.getDefaultConfig(), ...this.config };

    return `
      <div class="block spacer-block" style="
        height: ${config.height}px;
        width: 100%;
      "></div>
    `;
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'height',
        label: '空白高度',
        type: 'number',
        min: 5,
        max: 200,
        unit: 'px'
      }
    ];
  }
}

