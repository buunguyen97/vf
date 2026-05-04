import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface ChargingStop {
  stopNumber: number;
  stations: any[];
}

export default function RouteItinerary({
  stations,
  chargingStops,
  onStationSelect,
  insufficientBattery,
}: {
  stations?: any[];
  chargingStops?: ChargingStop[];
  onStationSelect: (station: any) => void;
  insufficientBattery?: boolean;
}) {
  const [expandedStops, setExpandedStops] = useState<Record<number, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  const hasStops = chargingStops && chargingStops.length > 0;
  const hasLegacyStations = stations && stations.length > 0;

  if (!hasStops && !hasLegacyStations) return null;

  const toggleAlternatives = (stopNumber: number) => {
    setExpandedStops(prev => ({ ...prev, [stopNumber]: !prev[stopNumber] }));
  };

  if (hasStops) {
    return (
      <View style={styles.container}>
        {/* Emergency Warning */}
        {insufficientBattery && !collapsed && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Pin Không Đủ Đến Điểm Đến</Text>
              <Text style={styles.warningText}>
                Mức pin hiện tại quá thấp để đến đích. Hãy sạc tại trạm gần nhất bên dưới.
              </Text>
            </View>
          </View>
        )}

        {/* Header */}
        <TouchableOpacity
          style={styles.header}
          onPress={() => setCollapsed(!collapsed)}
        >
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons
              name="lightning-bolt"
              size={16}
              color={insufficientBattery ? '#DA303E' : '#00B14F'}
            />
            <Text style={styles.headerTitle}>
              {insufficientBattery ? '⚡ Sạc Khẩn Cấp' : 'Lộ Trình Tối Ưu'}
            </Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{chargingStops!.length} trạm</Text>
            </View>
          </View>
          <Ionicons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={16}
            color="rgba(255,255,255,0.4)"
          />
        </TouchableOpacity>

        {!collapsed && (
          <View style={styles.stopsContainer}>
            {chargingStops!.map((stop) => {
              const recommended = stop.stations[0];
              const alternatives = stop.stations.slice(1);
              const isExpanded = expandedStops[stop.stopNumber];

              return (
                <View key={stop.stopNumber} style={{ marginBottom: 4 }}>
                  {/* Recommended Station */}
                  <TouchableOpacity
                    style={styles.stopRow}
                    onPress={() => onStationSelect(recommended)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.timelineDot}>
                      <Text style={styles.timelineDotText}>{stop.stopNumber}</Text>
                    </View>

                    <View style={styles.stopInfo}>
                      <View style={styles.recommendBadge}>
                        <Text style={styles.recommendText}>★ Khuyên dùng</Text>
                      </View>
                      <Text style={styles.stationName} numberOfLines={1}>
                        {recommended.name}
                      </Text>
                      <Text style={styles.stationAddress} numberOfLines={1}>
                        {recommended.address}
                      </Text>

                      <View style={styles.badgeRow}>
                        <View style={styles.kmBadge}>
                          <Text style={styles.kmBadgeText}>
                            Km {Math.round(recommended.distanceFromStartKm || 0)}
                          </Text>
                        </View>
                        <View style={styles.batteryBadge}>
                          <Text style={styles.batteryBadgeText}>
                            Pin còn: {recommended.batteryAtStation}%
                          </Text>
                        </View>
                        <View style={styles.powerBadge}>
                          <Text style={styles.powerBadgeText}>
                            {recommended.power_kw} kW
                          </Text>
                        </View>
                        {recommended.detourKm > 0.05 && (
                          <View style={styles.detourBadge}>
                            <Text style={styles.detourBadgeText}>
                              ↗ {recommended.detourKm < 1
                                ? `${Math.round(recommended.detourKm * 1000)}m`
                                : `${recommended.detourKm.toFixed(1)}km`}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Alternatives Toggle */}
                  {alternatives.length > 0 && (
                    <View style={{ marginLeft: 40, marginBottom: 8 }}>
                      <TouchableOpacity
                        style={styles.altToggle}
                        onPress={() => toggleAlternatives(stop.stopNumber)}
                      >
                        <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.altToggleText}>
                          {alternatives.length} trạm thay thế khác
                        </Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={12}
                          color="rgba(255,255,255,0.4)"
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.altList}>
                          {alternatives.map((alt: any, altIdx: number) => (
                            <TouchableOpacity
                              key={alt.id}
                              style={styles.altRow}
                              onPress={() => onStationSelect(alt)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.altDot}>
                                <Text style={styles.altDotText}>
                                  {String.fromCharCode(65 + altIdx + 1)}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.altName} numberOfLines={1}>{alt.name}</Text>
                                <Text style={styles.altAddress} numberOfLines={1}>{alt.address}</Text>
                                <View style={[styles.badgeRow, { marginTop: 4 }]}>
                                  <View style={[styles.kmBadge, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                                    <Text style={[styles.kmBadgeText, { color: 'rgba(255,255,255,0.5)' }]}>
                                      Km {Math.round(alt.distanceFromStartKm || 0)}
                                    </Text>
                                  </View>
                                  <View style={[styles.batteryBadge, { backgroundColor: 'rgba(0,177,79,0.1)' }]}>
                                    <Text style={[styles.batteryBadgeText, { color: 'rgba(0,177,79,0.8)' }]}>
                                      Pin: {alt.batteryAtStation}%
                                    </Text>
                                  </View>
                                  <View style={[styles.powerBadge, { backgroundColor: 'rgba(20,100,244,0.1)' }]}>
                                    <Text style={[styles.powerBadgeText, { color: 'rgba(20,100,244,0.8)' }]}>
                                      {alt.power_kw} kW
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Destination marker */}
            <View style={styles.destinationRow}>
              <View style={styles.destinationDot}>
                <Ionicons name="flag" size={12} color="#fff" />
              </View>
              <Text style={styles.destinationText}>Điểm Đến</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  // Legacy flat station list
  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Lộ Trình Tối Ưu</Text>
      {stations!.map((station: any, idx: number) => (
        <TouchableOpacity
          key={station.id}
          style={styles.stopRow}
          onPress={() => onStationSelect(station)}
          activeOpacity={0.7}
        >
          <View style={[styles.timelineDot, { backgroundColor: '#000', borderColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={[styles.timelineDotText, { color: 'rgba(255,255,255,0.6)' }]}>{idx + 1}</Text>
          </View>
          <View style={styles.stopInfo}>
            <Text style={styles.stationName} numberOfLines={1}>{station.name}</Text>
            <Text style={styles.stationAddress} numberOfLines={1}>{station.address}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.kmBadge}>
                <Text style={styles.kmBadgeText}>Km {Math.round(station.distanceFromStartKm || 0)}</Text>
              </View>
              <View style={styles.batteryBadge}>
                <Text style={styles.batteryBadgeText}>Dự Kiến: {station.batteryAtStation}%</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      ))}
      <View style={styles.destinationRow}>
        <View style={styles.destinationDot}>
          <Ionicons name="flag" size={12} color="#fff" />
        </View>
        <Text style={styles.destinationText}>Điểm Đến</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10,10,10,0.95)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 12,
    marginTop: 12,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(218,48,62,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(218,48,62,0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  warningIcon: { fontSize: 18, marginTop: 2 },
  warningTitle: { fontSize: 11, fontWeight: 'bold', color: '#DA303E', textTransform: 'uppercase', letterSpacing: 0.5 },
  warningText: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: { fontSize: 9, fontWeight: 'bold', color: 'rgba(255,255,255,0.5)' },
  stopsContainer: { gap: 0 },
  stopRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 8,
    borderRadius: 12,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00B14F',
    borderWidth: 2,
    borderColor: 'rgba(0,177,79,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  timelineDotText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  stopInfo: { flex: 1, paddingBottom: 8 },
  recommendBadge: {
    backgroundColor: 'rgba(0,177,79,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,177,79,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  recommendText: { fontSize: 8, fontWeight: '900', color: '#00B14F', textTransform: 'uppercase', letterSpacing: 1 },
  stationName: { fontSize: 13, fontWeight: 'bold', color: 'rgba(255,255,255,0.9)', lineHeight: 18 },
  stationAddress: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  kmBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  kmBadgeText: { fontSize: 10, fontWeight: 'bold', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 },
  batteryBadge: {
    backgroundColor: 'rgba(0,177,79,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,177,79,0.2)',
  },
  batteryBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#20C997' },
  powerBadge: {
    backgroundColor: 'rgba(20,100,244,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(20,100,244,0.2)',
  },
  powerBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#1464F4' },
  detourBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  detourBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#F59E0B' },
  altToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  altToggleText: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  altList: {
    marginTop: 6,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.05)',
    paddingLeft: 12,
    gap: 4,
  },
  altRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 8,
    borderRadius: 8,
  },
  altDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  altDotText: { fontSize: 9, fontWeight: 'bold', color: 'rgba(255,255,255,0.5)' },
  altName: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  altAddress: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 },
  destinationRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 8,
    borderRadius: 12,
    marginTop: 8,
    opacity: 0.6,
  },
  destinationDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1464F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  destinationText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    alignSelf: 'center',
  },
});
