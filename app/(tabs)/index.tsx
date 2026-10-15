import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchAllHealthMetrics, HealthDataMetrics, initializeHealthKit } from '../../src/services/healthKit';
import { calculateReadinessRisk, MLResult } from '../../src/services/mlEngine';

export default function ReadinessScreen() {
  const [metrics, setMetrics] = useState<HealthDataMetrics | null>(null);
  const [status, setStatus] = useState<MLResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const loadHealthData = async () => {
    setLoading(true);
    try {
      const isInitialized = await initializeHealthKit();
      if (isInitialized) {
        // Ambil SEMUA data asli dari Apple Health secara terintegrasi
        const data = await fetchAllHealthMetrics();
        setMetrics(data);

        // Masukkan data akurat langsung ke Mesin ML Lokal
        const mlResult = calculateReadinessRisk({
          rhrToday: data.rhrToday,
          rhr7dMedian: data.rhr7dMedian,
          sleepHours: data.sleepHours,
          sleep7dMean: data.sleep7dMean,
          sleep7dSd: data.sleep7dSd,
          rhrSd: data.rhrSd,
          acwr: data.acwr,
        });
        setStatus(mlResult);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Running Coach Readiness</Text>
        
        <TouchableOpacity style={styles.button} onPress={loadHealthData} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Menghitung dari Apple Health...' : 'Sync & Analisis Apple Health'}</Text>
        </TouchableOpacity>

        {metrics && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Data Apple Health (Asli)</Text>
            <Text style={styles.text}>RHR Hari Ini: <Text style={styles.bold}>{metrics.rhrToday} bpm</Text></Text>
            <Text style={styles.text}>RHR Baseline (7 Hari): {metrics.rhr7dMedian} bpm</Text>
            <Text style={styles.text}>Tidur Semalam: {metrics.sleepHours.toFixed(1)} jam</Text>
            <Text style={styles.text}>Tidur Baseline (7 Hari): {metrics.sleep7dMean.toFixed(1)} jam</Text>
            <Text style={styles.text}>ACWR (Beban Latihan): {metrics.acwr}</Text>
          </View>
        )}

        {status && (
          <View style={[styles.card, { backgroundColor: status.decision === 'REST' ? '#ffebee' : status.decision === 'DOWNGRADE' ? '#fffde7' : '#e8f5e9' }]}>
            <Text style={styles.cardTitle}>Hasil Keputusan ML</Text>
            <Text style={styles.text}>Status Keputusan: <Text style={styles.bold}>{status.decision}</Text></Text>
            <Text style={styles.text}>Skor Risiko: {status.risk}</Text>
            <Text style={styles.text}>Rekomendasi Latihan: <Text style={styles.bold}>{status.recommendedWorkout}</Text></Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scroll: { padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', marginTop: 20 },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  text: { fontSize: 14, color: '#555', marginBottom: 5 },
  bold: { fontWeight: 'bold', color: '#000' }
});