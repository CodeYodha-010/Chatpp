import Joi from 'joi';
import { isDisposableEmail } from './disposableEmail.js';

export function validate(schema, target = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message
        }))
      });
    }
    req[target] = value;
    next();
  };
}

export function checkDisposableEmail(req, res, next) {
  const email = req.body?.email;
  if (email && isDisposableEmail(email)) {
    return res.status(400).json({
      error: 'Please use a valid email address. Temporary email addresses are not allowed.'
    });
  }
  next();
}

export const schemas = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(8).max(100)
      .pattern(/[a-zA-Z]/, 'letter')
      .pattern(/[0-9]/, 'number')
      .required()
      .messages({
        'string.pattern.name': 'Password must contain at least one letter and one number',
        'string.min': 'Password must be at least 8 characters long'
      }),
    display_name: Joi.string().max(50).optional()
  }),
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),
  createRoom: Joi.object({
    name: Joi.string().min(1).max(50).required(),
    description: Joi.string().max(200).allow('').optional(),
    type: Joi.string().valid('public', 'private').default('public')
  })
};
