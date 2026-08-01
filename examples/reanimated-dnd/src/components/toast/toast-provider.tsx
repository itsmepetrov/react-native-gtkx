import {
  useCallback,
  useMemo,
  useState,
  type FC,
  type PropsWithChildren,
} from "react"
import { InternalToastContext, ToastContext, type ToastType } from "./context"
import { Toast } from "./toast"

export const ToastProvider: FC<PropsWithChildren> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastType[]>([])

  const showToast = useCallback((toast: Omit<ToastType, "id">) => {
    setToasts((prev) => {
      if (prev.length > 5) {
        return prev
      }

      const key =
        toast.key ||
        (typeof toast.title === "string"
          ? `${toast.title}-${Date.now()}`
          : `toast-${Date.now()}`)

      const updatedPrev = prev.map((item) => ({
        ...item,
        id: item.id + 1,
      }))
      return [...updatedPrev, { ...toast, key, id: 0 }]
    })
  }, [])

  const sortedToasts = useMemo(() => {
    return toasts.sort((a, b) => a.id - b.id)
  }, [toasts])

  const onDismiss = useCallback((toastId: number) => {
    setToasts((prev) => {
      return prev
        .map((item) => {
          if (item.id === toastId) {
            return null
          }
          if (item.id > toastId) {
            return { ...item, id: item.id - 1 }
          }
          return item
        })
        .filter(Boolean) as ToastType[]
    })
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
  }, [])

  const value = useMemo(
    () => ({ showToast, dismissAll }),
    [showToast, dismissAll],
  )

  // Upstream caches each rendered node in a ref and reads that ref during
  // render. React already preserves a keyed child's instance across renders,
  // so the cache changes nothing except making the render impure — which is
  // what this repo's react-hooks/refs rule objects to. Dropped.
  const renderToast = useCallback(
    (toast: ToastType, index: number) => {
      const key = toast.key || `toast-${toast.id}`
      return (
        <Toast
          key={key}
          toastKey={key}
          index={index}
          onDismiss={onDismiss}
        />
      )
    },
    [onDismiss],
  )

  const internalToastValue = useMemo(() => ({ toasts }), [toasts])

  return (
    <ToastContext.Provider value={value}>
      <InternalToastContext.Provider value={internalToastValue}>
        {children}
        {sortedToasts.map((toast, index) => renderToast(toast, index))}
      </InternalToastContext.Provider>
    </ToastContext.Provider>
  )
}
