import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Hello World!' })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  
  return NextResponse.json({ 
    message: 'Hello World from POST!',
    received: body
  })
}