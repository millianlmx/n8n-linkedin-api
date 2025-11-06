export function mockClass<T extends new (...args: any[]) => any>(
  cls: T,
): jest.Mocked<InstanceType<T>> {
  const mocked = jest.fn(() => {
    const instance = new (cls as any)();
    for (const key of Object.getOwnPropertyNames(cls.prototype)) {
      if (key !== 'constructor' && typeof instance[key] === 'function') {
        instance[key] = jest.fn();
      }
    }
    return instance;
  });

  return new mocked() as jest.Mocked<InstanceType<T>>;
}
