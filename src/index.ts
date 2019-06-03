enum PromiseStatus {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  REJECTED = 'rejected',
}

function noop() {}

//构造函数的参数
type PromiseExecutor<T = any> = (
  resolve?: PromiseResolve<T>,
  reject?: PromiseReject<T | any>
) => any
//成功状态的回调函数
type PromiseResolve<T = any> = (value?: T) => void
//失败状态的回调函数
type PromiseReject<T = any> = (reason?: T) => void

//then方法的类型
type PromiseThen<T = any> = (
  onResolved?: PromiseResolve<T>,
  onRejected?: PromiseReject<T | any>
) => UdfPromise<T | any>
//catch方法的类型
type PromiseCatch<T = any> = (
  onRejected?: PromiseReject<T | any>
) => UdfPromise<T | any>
//finally方法的类型
type PromiseFinally<T = any> = (
  handler?: (value?: any) => any
) => UdfPromise<T | any>
type PromiseRace = (iterable: UdfPromise<any>[]) => UdfPromise<any>
type PromiseAll = (iterable: UdfPromise<any>[]) => UdfPromise<any[]>

//简单实现Promise(then|catch|race|all)
export default class UdfPromise<T = any> {
  value: T | any = undefined
  status: PromiseStatus = PromiseStatus.PENDING
  resolveCallbacks: PromiseResolve[] = []
  rejectedCallbacks: PromiseReject[] = []

  /**
   *
   *
   * @type {PromiseResolve<T>}
   * @memberof UdfPromise
   */
  resolve: PromiseResolve<T> = (value?: T) => {
    if (value instanceof UdfPromise) {
      //如果value是一个Promise 返回Promise对象
      return value.then(this.resolve, this.reject)
    }
    //暂时使用宏任务替代Promise的异步执行
    //真实实现具体可以参考https://github.com/kriskowal/asap/blob/master/browser-raw.js
    setTimeout(() => {
      if (status === PromiseStatus.PENDING) {
        this.status = PromiseStatus.FULFILLED
        this.value = value
        this.resolveCallbacks.forEach(cb => cb())
      }
    })
  }

  /**
   *
   *
   * @type {PromiseReject<T>}
   * @memberof UdfPromise
   */
  reject: PromiseReject<T> = (value?: T) => {
    setTimeout(() => {
      if (status === PromiseStatus.PENDING) {
        this.status = PromiseStatus.REJECTED
        this.value = value
        this.rejectedCallbacks.forEach(cb => cb())
      }
    })
  }

  constructor(fn: PromiseExecutor) {
    try {
      fn(this.resolve, this.reject)
    } catch (e) {
      this.reject(e)
    }
  }

  /**
   *
   * @param {UdfPromise} newPromise
   * @param {any} returnValue 上层promise的fulfilled返回值
   * @param {PromiseResolve} resolve
   * @param {PromiseReject} reject
   * @static
   * @memberof UdfPromise
   */
  static resolvePromise = <T = any>(
    newPromise: UdfPromise<T>,
    returnValue: any,
    resolve: PromiseResolve<T>,
    reject: PromiseReject<T | any>
  ) => {
    // 规范 2.3.1，returnValue 不能和 newMyPromise 相同，避免循环引用
    if (newPromise === returnValue) {
      return reject(new TypeError('Cicle reference error'))
    }
    // 规范 2.3.2 如果 returnValue 为 Promise，状态为 pending 需要继续等待否则执行
    if (returnValue instanceof UdfPromise) {
      if (returnValue.status === PromiseStatus.PENDING) {
        returnValue.then(function(value: any) {
          UdfPromise.resolvePromise(newPromise, value, resolve, reject)
        }, reject)
      } else {
        // 规范 2.3.2.2 规范 2.3.2.3  如果 returnValue 为 Promise，状态为 fulfilled 或 rejected ，原因用于相同的状态
        returnValue.then(resolve, reject)
      }
      return
    }
    // 规范 2.3.3.3.3 reject 或者 resolve 其中一个执行过得话，忽略其他的
    // 所以使用 called 来标记是否执行过
    let called = false
    // 规范 2.3.3，判断 returnValue 是否为对象或者函数
    if (
      returnValue !== null &&
      (typeof returnValue === 'object' || typeof returnValue === 'function')
    ) {
      // 规范 2.3.3.2，如果不能取出 then，就 reject
      try {
        let then = returnValue.then
        if (typeof then === 'function') {
          then.call(
            returnValue,
            (y: any) => {
              if (called) return
              called = true
              UdfPromise.resolvePromise(newPromise, y, resolve, reject)
            },
            (e: any) => {
              if (called) return
              called = true
              reject(e)
            }
          )
        } else {
          resolve(returnValue)
        }
      } catch (e) {
        if (called) return
        called = true
        reject(e)
      }
    } else {
      resolve(returnValue)
    }
  }

  /**
   *
   *
   * @type {PromiseThen<T>}
   * @memberof UdfPromise
   */
  then: PromiseThen<T> = (
    onResolved?: PromiseResolve<T>,
    onRejected?: PromiseReject<T>
  ): UdfPromise<T> => {
    const that = this
    // 规范 2.2.7，then 必须返回一个新的 promise
    let newMyPromise: UdfPromise
    // 规范 2.2.onResolved 和 onRejected 都为可选参数
    // 如果 onResolved 和 onRejected 不是函数则要自行生成新的函数，保证了透传
    const _onResolved: any =
      typeof onResolved === 'function' ? onResolved : (v: any) => v
    const _onRejected: any =
      typeof onRejected === 'function'
        ? onRejected
        : (r: any) => {
            throw r
          }

    // 初始状态
    if (this.status === PromiseStatus.PENDING) {
      newMyPromise = new UdfPromise<T>(function(resolve, reject) {
        that.resolveCallbacks.push(function() {
          // 使用 try/catch 如果有报错的话，直接 reject(r)
          try {
            var returnValue = _onResolved(that.value)
            // resolve(returnValue) 本次 Promise 继续 returnValue
            UdfPromise.resolvePromise(
              newMyPromise,
              returnValue,
              resolve,
              reject
            )
          } catch (r) {
            reject(r)
          }
        })

        that.rejectedCallbacks.push(function() {
          try {
            var returnValue = _onRejected(that.value)
            // resolve(returnValue) 本次 Promise 继续 returnValue
            UdfPromise.resolvePromise(
              newMyPromise,
              returnValue,
              resolve,
              reject
            )
          } catch (r) {
            reject(r)
          }
        })
      })
      return newMyPromise
    }
    // resolved状态
    if (this.status === PromiseStatus.FULFILLED) {
      newMyPromise = new UdfPromise<T>(function(resolve, reject) {
        // 规范 2.2.4，为了保证 onFulfilled，onRjected 异步执行 所以用了 setTimeout 包裹下
        setTimeout(function() {
          try {
            var returnValue = _onResolved(this.value)
            // resolve(returnValue) 本次 Promise 继续 returnValue
            UdfPromise.resolvePromise(
              newMyPromise,
              returnValue,
              resolve,
              reject
            )
          } catch (reason) {
            reject(reason)
          }
        })
      })
      return newMyPromise
    }
    // rejected状态
    if (this.status === PromiseStatus.REJECTED) {
      newMyPromise = new UdfPromise<T>(function(resolve, reject) {
        setTimeout(function() {
          // 异步执行onRejected
          try {
            var returnValue = _onRejected(this.value)
            // resolve(returnValue) 本次 Promise 继续 returnValue
            UdfPromise.resolvePromise(
              newMyPromise,
              returnValue,
              resolve,
              reject
            )
          } catch (reason) {
            reject(reason)
          }
        })
      })
      return newMyPromise
    }
  }

  catch: PromiseCatch<T> = (onRejecjed?: PromiseReject<T>): UdfPromise<T> => {
    let newPromise: UdfPromise
    newPromise = new UdfPromise(noop)
    return newPromise
  }

  finally: PromiseFinally<T> = (
    handler?: (value?: any) => any
  ): UdfPromise<T> => {
    let newPromise: UdfPromise
    newPromise = new UdfPromise(noop)
    return newPromise
  }
}
