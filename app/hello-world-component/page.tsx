'use client'

export default function HelloWorldComponent() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8">
            <h1 className="text-4xl font-bold mb-8 text-center">
                Hello World
            </h1>
            <button 
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                onClick={() => alert('Button clicked!')}
            >
                Click Me
            </button>
        </div>
    );
}