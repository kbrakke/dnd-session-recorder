export default function TestPage() {
  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">Tailwind Test Page</h1>
      <div className="bg-red-500 text-white p-4 rounded-lg mb-4 shadow-lg">
        This should be red background with white text
      </div>
      <div className="bg-green-500 text-white p-4 rounded-lg mb-4 shadow-lg">
        This should be green background with white text
      </div>
      <div className="bg-blue-500 text-white p-4 rounded-lg mb-4 shadow-lg">
        This should be blue background with white text
      </div>
      <button className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded shadow-lg transform hover:scale-105 transition-all duration-200">
        Purple Button
      </button>
    </div>
  );
}