import {BrowserRouter, Routes, Route, Navigate} from 'react-router-dom';
import SegmentationConsole from './pages/SegmentationConsole';
import CustomerConsole from './pages/CustomerConsole';
import SegmentationHistory from './pages/SegmentationHistory';
import SegmentDetailsPage from './pages/SegmentDetailsPage';

const App = () => {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<Navigate to="/customer/history" replace />} />
				<Route path="/admin" element={<SegmentationConsole />} />
				<Route path="/customer" element={<CustomerConsole />} />
				<Route path="/customer/history" element={<SegmentationHistory />} />
				<Route path="/customer/segments-details" element={<SegmentDetailsPage />} />
			</Routes>
		</BrowserRouter>
	);
};

export default App;
