import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Linking, Switch } from 'react-native';
import { FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Clipboard from 'expo-clipboard';
import { 
  getEnergyPer1PercentWh, 
  getAdjustedDefaultConsumption, 
  getDefaultKmPer1Percent 
} from '../utils/consumption';

export default function PlannerControls({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  batteryPercent,
  setBatteryPercent,
  targetBatteryPercent,
  setTargetBatteryPercent,
  conditions,
  setConditions,
  onSuggestStations,
  isLoadingStations,
  origin,
  destination,
  setDestination,
  onParseLink,
  isParsingLink,
  estimatedRange,
  isCalculating,
  locationName,
}: any) {
  const [googleLink, setGoogleLink] = useState('');
  const [showVehicleList, setShowVehicleList] = useState(false);
  const selectedVehicle = vehicles.find((v: any) => v.id === selectedVehicleId);

  // Consumption Logic
  const defaultConsumption = selectedVehicle ? getAdjustedDefaultConsumption(selectedVehicle) : 150;
  const currentConsumption = conditions.consumptionWhKm || defaultConsumption;
  const energyPer1Percent = selectedVehicle ? getEnergyPer1PercentWh(selectedVehicle) : 600;
  const kmPer1Percent = parseFloat((energyPer1Percent / currentConsumption).toFixed(1));
  const defaultKmPer1Percent = selectedVehicle ? getDefaultKmPer1Percent(selectedVehicle) : 2.0;
  
  const minKm = parseFloat((energyPer1Percent / 350).toFixed(1));
  const maxKm = parseFloat((energyPer1Percent / 50).toFixed(1));

  const handleKmSliderChange = (newKm: number) => {
    if (newKm <= 0) return;
    const newConsumption = Math.round(energyPer1Percent / newKm);
    setConditions({ ...conditions, consumptionWhKm: Math.max(50, Math.min(350, newConsumption)) });
  };

  const copyToClipboard = async (text: string) => {
    if (text) await Clipboard.setStringAsync(text);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionDividerText}>THIẾT LẬP HÀNH TRÌNH</Text>

      {/* 1. DÒNG XE ĐIỆN VINFAST */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <FontAwesome5 name="car-side" size={10} color="rgba(255,255,255,0.6)" style={styles.cardIcon} />
          <Text style={styles.cardTitle}>DÒNG XE ĐIỆN VINFAST</Text>
        </View>
        <TouchableOpacity 
          style={styles.dropdownBtn} 
          onPress={() => setShowVehicleList(!showVehicleList)}
        >
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <FontAwesome5 name="car" size={14} color="#1464F4" style={{marginRight: 8}} />
            <Text style={styles.dropdownText}>
              {selectedVehicle?.display_name || 'Chọn xe'}
            </Text>
            {selectedVehicle && (
              <Text style={styles.dropdownBadge}>{selectedVehicle.battery_capacity_kwh}kWh</Text>
            )}
          </View>
          <FontAwesome5 name={showVehicleList ? "chevron-up" : "chevron-down"} size={12} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>

        {showVehicleList && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop: 10, marginHorizontal: -12}} contentContainerStyle={{paddingHorizontal: 12}}>
            {vehicles.map((v: any) => (
              <TouchableOpacity 
                key={v.id} 
                style={[styles.pillBtn, selectedVehicleId === v.id && styles.pillBtnActive]}
                onPress={() => { onSelectVehicle(v.id); setShowVehicleList(false); }}
              >
                <Text style={[styles.pillText, selectedVehicleId === v.id && styles.pillTextActive]}>
                  {v.display_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* 2. MỨC PIN HIỆN TẠI */}
      <View style={styles.card}>
        <View style={styles.flexBetween}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="battery-80" size={12} color="rgba(255,255,255,0.6)" style={styles.cardIcon} />
            <Text style={styles.cardTitle}>MỨC PIN HIỆN TẠI</Text>
          </View>
          <Text style={[styles.percentValue, {color: '#22c55e'}]}>{Math.round(batteryPercent)}%</Text>
        </View>
        <Slider
          style={{width: '100%', height: 40}}
          minimumValue={1}
          maximumValue={100}
          step={1}
          value={batteryPercent}
          onValueChange={setBatteryPercent}
          minimumTrackTintColor="#22c55e"
          maximumTrackTintColor="rgba(255,255,255,0.1)"
          thumbTintColor="#fff"
        />
      </View>

      {/* 3. NGƯỠNG PIN TỐI THIỂU */}
      <View style={styles.card}>
        <View style={styles.flexBetween}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="shield-check-outline" size={12} color="#1464F4" style={styles.cardIcon} />
            <Text style={[styles.cardTitle, {color: '#fff'}]}>NGƯỠNG PIN TỐI THIỂU</Text>
          </View>
          <View style={styles.blueBadge}>
            <Text style={{color: '#1464F4', fontWeight: 'bold', fontSize: 12}}>{Math.round(targetBatteryPercent)}%</Text>
          </View>
        </View>
        <Text style={styles.subtext}>Giữ lại tối thiểu {Math.round(targetBatteryPercent)}% pin khi đến trạm hoặc điểm đến.</Text>
        <Slider
          style={{width: '100%', height: 40}}
          minimumValue={5}
          maximumValue={50}
          step={1}
          value={targetBatteryPercent}
          onValueChange={setTargetBatteryPercent}
          minimumTrackTintColor="#1464F4"
          maximumTrackTintColor="rgba(255,255,255,0.1)"
          thumbTintColor="#fff"
        />
      </View>

      {/* 4. SỐ KM ĐI ĐƯỢC VỚI 1% PIN */}
      <View style={styles.card}>
        <View style={styles.flexBetween}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="lightning-bolt" size={14} color="#22c55e" style={styles.cardIcon} />
            <Text style={styles.cardTitle}>SỐ KM ĐI ĐƯỢC VỚI 1% PIN</Text>
          </View>
          <View style={styles.greenBadge}>
            <Text style={{color: '#22c55e', fontWeight: 'bold', fontSize: 12}}>{kmPer1Percent} <Text style={{fontSize: 10, fontWeight: 'normal'}}>km/1%</Text></Text>
          </View>
        </View>
        <Slider
          style={{width: '100%', height: 40}}
          minimumValue={minKm}
          maximumValue={maxKm}
          step={0.1}
          value={kmPer1Percent}
          onSlidingComplete={handleKmSliderChange}
          minimumTrackTintColor="rgba(255,255,255,0.2)"
          maximumTrackTintColor="rgba(255,255,255,0.1)"
          thumbTintColor="#fff"
        />
        <View style={styles.flexBetween}>
           <Text style={styles.subtext}>
             Mặc định: <Text style={{color: '#1464F4'}} onPress={() => setConditions({ ...conditions, consumptionWhKm: defaultConsumption })}>{defaultKmPer1Percent} km/1%</Text>
           </Text>
           <Text style={styles.subtext}>{currentConsumption} Wh/km</Text>
        </View>
      </View>

      {/* 5. LINK GOOGLE MAPS */}
      <View style={styles.card}>
        <View style={styles.flexBetween}>
          <View style={styles.cardHeader}>
            <Ionicons name="link" size={14} color="#1464F4" style={styles.cardIcon} />
            <Text style={[styles.cardTitle, {color: '#fff', fontSize: 13}]}>Dán link chỉ đường Google Maps</Text>
          </View>
          <View style={styles.guideBadge}>
            <Ionicons name="help-circle-outline" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={{color: 'rgba(255,255,255,0.6)', fontSize: 10, marginLeft: 4}}>Hướng dẫn</Text>
          </View>
        </View>
        
        <View style={styles.infoBox}>
          <Text style={{color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 18}}>
            Mẹo nhanh: mở tuyến đường trên Google Maps, nhấn chia sẻ, sao chép link rồi quay lại đây <Text style={{color: '#fff', fontWeight: 'bold'}}>chạm vào ô bên dưới và dán</Text>, sau đó bấm <Text style={{color: '#fff', fontWeight: 'bold'}}>Phân tích</Text>.
          </Text>
        </View>

        <View style={{flexDirection: 'row', gap: 6, marginTop: 10}}>
          <TouchableOpacity style={styles.openMapBtn} onPress={() => {
            Linking.openURL('https://maps.google.com/').catch(() => {
              // fallback if the device cannot handle the URL (e.g. simulator without browser)
              console.log("Không thể mở Google Maps");
            });
          }}>
            <Ionicons name="map-outline" size={14} color="#22c55e" style={{marginRight: 4}} />
            <Text style={{color: '#22c55e', fontSize: 12, fontWeight: 'bold'}}>Mở GG Map</Text>
          </TouchableOpacity>
          <TextInput 
            style={styles.linkInput} 
            placeholder="https://maps.app.goo.gl/..." 
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={googleLink}
            onChangeText={setGoogleLink}
            autoCapitalize="none"
          />
          <TouchableOpacity 
            style={[styles.analyzeBtn, isParsingLink && {opacity: 0.7}]} 
            onPress={() => onParseLink(googleLink)}
            disabled={isParsingLink}
          >
            {isParsingLink ? (
               <ActivityIndicator color="#fff" size="small" />
            ) : (
               <Text style={{color: '#fff', fontSize: 12, fontWeight: 'bold'}}>Phân tích</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 6. ĐIỂM ĐI / ĐIỂM ĐẾN */}
      <View style={[styles.row, {gap: 12}]}>
        <View style={[styles.card, {flex: 1, padding: 12, marginBottom: 0}]}>
          <View style={styles.flexBetween}>
            <Text style={styles.cardTitle}>ĐIỂM ĐI</Text>
            <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.4)" />
          </View>
          <View style={[styles.flexBetween, {marginTop: 8}]}>
            <Text style={styles.locText} numberOfLines={1}>
              {origin ? `${origin.latitude.toFixed(5)}, ${origin.longitude.toFixed(5)}` : 'Đang tìm...'}
            </Text>
            <TouchableOpacity onPress={() => origin && copyToClipboard(`${origin.latitude},${origin.longitude}`)} style={styles.copyBtn}>
              <Ionicons name="copy-outline" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.copyText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, {flex: 1, padding: 12, marginBottom: 0}]}>
          <View style={styles.flexBetween}>
            <Text style={styles.cardTitle}>ĐIỂM ĐẾN</Text>
            <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.4)" />
          </View>
          <View style={[styles.flexBetween, {marginTop: 8}]}>
            <Text style={[styles.locText, !destination && {color: 'rgba(255,255,255,0.3)'}]} numberOfLines={1}>
              {destination ? `${destination.latitude.toFixed(5)}, ${destination.longitude.toFixed(5)}` : 'Chưa có'}
            </Text>
            {destination && (
              <TouchableOpacity onPress={() => copyToClipboard(`${destination.latitude},${destination.longitude}`)} style={styles.copyBtn}>
                <Ionicons name="copy-outline" size={12} color="rgba(255,255,255,0.5)" />
                <Text style={styles.copyText}>Copy</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* 7. ĐIỀU KIỆN LÁI XE */}
      <View style={[styles.card, {marginTop: 12}]}>
         <View style={styles.cardHeader}>
           <Ionicons name="options-outline" size={14} color="rgba(255,255,255,0.6)" style={styles.cardIcon} />
           <Text style={styles.cardTitle}>ĐIỀU KIỆN LÁI XE</Text>
         </View>
         
         <View style={[styles.flexBetween, {marginTop: 8}]}>
           <Text style={{color: 'rgba(255,255,255,0.6)', fontSize: 12}}>Tốc Độ</Text>
           <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 'bold'}}>{conditions.speed} <Text style={{fontSize: 10, fontWeight: 'normal'}}>km/h</Text></Text>
         </View>
         <Slider
            style={{width: '100%', height: 40}}
            minimumValue={30}
            maximumValue={120}
            step={10}
            value={conditions.speed}
            onValueChange={(v) => setConditions({...conditions, speed: v})}
            minimumTrackTintColor="rgba(255,255,255,0.2)"
            maximumTrackTintColor="rgba(255,255,255,0.1)"
            thumbTintColor="#fff"
         />

         <View style={[styles.flexBetween, {marginTop: 8}]}>
           <Text style={{color: 'rgba(255,255,255,0.6)', fontSize: 12}} numberOfLines={1}>Nhiệt Độ Ngoài Trời{locationName ? ` (${locationName})` : ''}</Text>
           <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 'bold'}}>{conditions.temperature} <Text style={{fontSize: 10, fontWeight: 'normal'}}>°C</Text></Text>
         </View>
         <Slider
            style={{width: '100%', height: 40}}
            minimumValue={10}
            maximumValue={50}
            step={2}
            value={conditions.temperature}
            onValueChange={(v) => setConditions({...conditions, temperature: v})}
            minimumTrackTintColor="rgba(255,255,255,0.2)"
            maximumTrackTintColor="rgba(255,255,255,0.1)"
            thumbTintColor="#fff"
         />

         <View style={[styles.flexBetween, {marginTop: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)'}]}>
           <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <MaterialCommunityIcons name="weather-windy" size={16} color="#1464F4" style={{marginRight: 6}} />
              <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 'bold'}}>ĐIỀU HOÀ LẠNH</Text>
           </View>
           <Switch
             trackColor={{ false: "#3e3e3e", true: "#1464F4" }}
             thumbColor="#fff"
             ios_backgroundColor="#3e3e3e"
             onValueChange={() => setConditions({...conditions, acOn: !conditions.acOn})}
             value={conditions.acOn}
           />
         </View>
      </View>

      {/* 8. GỢI Ý TRẠM SẠC BUTTON */}
      <TouchableOpacity 
        style={[styles.actionBtn, isLoadingStations && styles.actionBtnDisabled]} 
        onPress={onSuggestStations}
        disabled={isLoadingStations}
      >
        {isLoadingStations ? (
          <ActivityIndicator color="#fff" size="small" style={{marginRight: 8}} />
        ) : (
          <MaterialCommunityIcons name="lightning-bolt" size={20} color="#fff" style={{marginRight: 6}} />
        )}
        <Text style={styles.actionBtnText}>
          {isLoadingStations ? 'ĐANG TÍNH TOÁN...' : 'GỢI Ý TRẠM SẠC'}
        </Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 40,
    backgroundColor: '#0a0a0a',
  },
  sectionDividerText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
  },
  flexBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIcon: {
    marginRight: 6,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
  },
  dropdownBtn: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  dropdownText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  dropdownBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginRight: 8,
  },
  pillBtnActive: {
    backgroundColor: 'rgba(20,100,244,0.15)',
  },
  pillText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#1464F4',
    fontWeight: 'bold',
  },
  percentValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  blueBadge: {
    backgroundColor: 'rgba(20,100,244,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(20,100,244,0.3)',
  },
  greenBadge: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  subtext: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },
  guideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  infoBox: {
    backgroundColor: 'rgba(20,100,244,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(20,100,244,0.2)',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  openMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  linkInput: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    paddingHorizontal: 10,
  },
  analyzeBtn: {
    backgroundColor: '#1464F4',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  locText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  copyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    marginLeft: 4,
  },
  actionBtn: {
    backgroundColor: '#00B14F',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  actionBtnDisabled: {
    opacity: 0.7,
    backgroundColor: '#008A3D',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  rangeCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
});
