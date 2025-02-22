import { orderValuesAtom } from "@/store/order.store"
import { ApolloError, useMutation } from "@apollo/client"
import { useAtomValue } from "jotai"

import { Customer } from "@/types/customer.types"
import { getMode } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

import { mutations } from "../graphql"

const useOrderCU = (onCompleted?: (id: string) => void) => {
  const { toast } = useToast()
  const { customer, type, _id, ...rest } = useAtomValue(orderValuesAtom)

  const origin = getMode()

  // TODO: get type default from config
  const variables = {
    ...rest,
    _id,
    customerId: (customer as Customer)?._id,
    origin,
    type: type || "eat",
  }

  const onError = (error: ApolloError) => {
    toast({ description: error.message, variant: "destructive" })
  }

  const [ordersAdd, { loading }] = useMutation(mutations.ordersAdd, {
    variables: variables,
    onCompleted(data) {
      const { _id } = (data || {}).ordersAdd || {}
      onCompleted && onCompleted(_id)
    },
    onError,
  })

  const [ordersEdit, { loading: loadingEdit }] = useMutation(
    mutations.ordersEdit,
    {
      variables,
      onCompleted(data) {
        const { _id } = (data || {}).ordersEdit || {}
        return onCompleted && onCompleted(_id)
      },
      refetchQueries: ["orderDetail"],
      onError,
    }
  )

  return {
    orderCU: _id ? ordersEdit : ordersAdd,
    loading: loading || loadingEdit,
    variables,
  }
}

export default useOrderCU
