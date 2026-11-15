// Must be the first import: keeps timers running while Android Auto drives the car screen.
import '@iternio/react-native-auto-play/installTimers';
// Registers the background location task before anything else can need it.
import './src/services/location/backgroundSource';
import 'expo-router/entry';
import { registerCarScreens } from './src/car/carScreens';

registerCarScreens();
