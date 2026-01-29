/**
 * 区块渲染引擎入口
 * 导出所有核心类和工具，并注册所有区块组件
 */

import { BlockRegistry } from './block-registry.js';
import { BlockRenderer } from './block-renderer.js';
import { DataResolver } from './data-resolver.js';
import { FontSizeManager } from './font-size-manager.js';
import { BaseBlock } from './blocks/base-block.js';

// 导入所有区块组件
import { CompanyHeaderBlock } from './blocks/company-header.js';
import { CompanyNameBlock } from './blocks/company-name.js';
import { CompanyAddressBlock } from './blocks/company-address.js';
import { DocumentTitleBlock } from './blocks/document-title.js';
import { ProductTableBlock } from './blocks/product-table.js';
import { OrderInfoBlock } from './blocks/order-info.js';
import { CustomerInfoBlock } from './blocks/customer-info.js';
import { SummaryInfoBlock } from './blocks/summary-info.js';
import { TermsBlock } from './blocks/terms-block.js';
import { SignatureAreaBlock } from './blocks/signature-area.js';
import { StampAreaBlock } from './blocks/stamp-area.js';
import { CustomTextBlock } from './blocks/custom-text.js';
import { DividerBlock } from './blocks/divider.js';
import { SpacerBlock } from './blocks/spacer.js';

// 注册所有区块
BlockRegistry.register('company-header', CompanyHeaderBlock);
BlockRegistry.register('company-name', CompanyNameBlock);
BlockRegistry.register('company-address', CompanyAddressBlock);
BlockRegistry.register('document-title', DocumentTitleBlock);
BlockRegistry.register('product-table', ProductTableBlock);
BlockRegistry.register('order-info', OrderInfoBlock);
BlockRegistry.register('customer-info', CustomerInfoBlock);
BlockRegistry.register('summary-info', SummaryInfoBlock);
BlockRegistry.register('terms-block', TermsBlock);
BlockRegistry.register('signature-area', SignatureAreaBlock);
BlockRegistry.register('stamp-area', StampAreaBlock);
BlockRegistry.register('custom-text', CustomTextBlock);
BlockRegistry.register('divider', DividerBlock);
BlockRegistry.register('spacer', SpacerBlock);

// 导出核心类和工具
export { BlockRegistry, BlockRenderer, DataResolver, FontSizeManager, BaseBlock };

// 导出所有区块类（可选，用于高级用法）
export {
  CompanyHeaderBlock,
  CompanyNameBlock,
  CompanyAddressBlock,
  DocumentTitleBlock,
  ProductTableBlock,
  OrderInfoBlock,
  CustomerInfoBlock,
  SummaryInfoBlock,
  TermsBlock,
  SignatureAreaBlock,
  StampAreaBlock,
  CustomTextBlock,
  DividerBlock,
  SpacerBlock
};

