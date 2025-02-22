"use client"

import dynamic from "next/dynamic"

import { getMode } from "@/lib/utils"

const Market = dynamic(() => import("./products.market"))
const Main = dynamic(() => import("./products.main"))
const CoffeeShop = dynamic(() => import("./products.coffeeShop"))

const Products = () => {
  const mode = getMode()

  return (
    <>
      {mode === "market" && <Market />}
      {mode === "main" && <Main />}
      {mode === "coffee-shop" && <CoffeeShop />}
    </>
  )
}

export default Products
