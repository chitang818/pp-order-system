/**
 * 密码验证器
 * 增强密码策略
 */

class PasswordValidator {
  constructor() {
    this.rules = {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
      maxLength: 128
    };
    
    this.commonPasswords = new Set([
      '12345678', 'password', 'admin123', 'qwerty123',
      '11111111', '88888888', 'password123', 'admin888',
      'abc12345', '12345abc', 'qwerty12', 'admin123456'
    ]);
  }
  
  validate(password) {
    const errors = [];
    
    if (!password || typeof password !== 'string') {
      return { valid: false, errors: ['密码不能为空'], strength: 'invalid' };
    }
    
    if (password.length < this.rules.minLength) {
      errors.push(`密码长度至少${this.rules.minLength}位`);
    }
    
    if (password.length > this.rules.maxLength) {
      errors.push(`密码长度不能超过${this.rules.maxLength}位`);
    }
    
    if (this.rules.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('密码必须包含大写字母');
    }
    
    if (this.rules.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('密码必须包含小写字母');
    }
    
    if (this.rules.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('密码必须包含数字');
    }
    
    if (this.rules.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('密码必须包含特殊字符');
    }
    
    if (this.commonPasswords.has(password.toLowerCase())) {
      errors.push('密码太常见，请使用更强的密码');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      strength: this.calculateStrength(password)
    };
  }
  
  calculateStrength(password) {
    let strength = 0;
    
    if (password.length >= 8) strength += 1;
    if (password.length >= 12) strength += 1;
    if (password.length >= 16) strength += 1;
    
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 1;
    
    const uniqueChars = new Set(password).size;
    if (uniqueChars >= password.length * 0.7) strength += 1;
    
    if (strength <= 3) return 'weak';
    if (strength <= 5) return 'medium';
    if (strength <= 7) return 'strong';
    return 'very_strong';
  }
}

module.exports = new PasswordValidator();
