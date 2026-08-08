import Joi from 'joi';

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

export const schemas = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).max(100).required(),
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
