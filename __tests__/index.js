import UdfPromise from '../src/index.ts'

test('promise status cannot be changed', () => {
  const promise =
    new UdfPromise() <
    Number >
    ((resolve, reject) => {
      setTimeout(() => {
        resolve(1)
        reject(33333)
      }, 200)
    })

  // promise.then(value => {
  //   console.log('then1 value', value);
  //   return value;
  // }).then(value => {
  //   console.log('then2 value', value);
  //   return value;
  // })
})
