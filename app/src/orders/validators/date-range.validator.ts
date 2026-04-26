import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsDateRangeValid', async: false })
export class IsDateRangeValidConstraint implements ValidatorConstraintInterface {
  validate(createdTo: string | undefined, args: ValidationArguments): boolean {
    const obj = args.object as { createdFrom?: string };

    if (!obj.createdFrom || !createdTo) {
      return true;
    }
    return new Date(obj.createdFrom).getTime() <= new Date(createdTo).getTime();
  }

  defaultMessage(): string {
    return 'createdFrom must be less than or equal to createdTo';
  }
}

export function IsDateRangeValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsDateRangeValid',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsDateRangeValidConstraint,
    });
  };
}