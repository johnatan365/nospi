import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import { useState } from 'react';

const menuItems = [
  { name: 'Dashboard', icon: '📊', route: '/admin' },
  { name: 'Eventos', icon: '🎉', route: '/admin/eventos' },
  { name: 'Usuarios', icon: '👤', route: '/admin/usuarios' },
  { name: 'Participantes', icon: '👥', route: '/admin/participantes' },
  { name: 'Preguntas', icon: '❓', route: '/admin/preguntas' },
  { name: 'En Vivo', icon: '🔴', route: '/admin/envivo' },
  { name: 'Config', icon: '⚙️', route: '/admin/config' },
];

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const isMobile = Dimensions.get('window').width < 768;

  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>

      {/* SIDEBAR */}
      {(open || !isMobile) && (
        <View style={[styles.sidebar, isMobile && styles.sidebarMobile]}>

          <Text style={styles.logo}>Nospi</Text>

          {menuItems.map((item, i) => {
            const active = pathname === item.route;

            return (
              <TouchableOpacity
                key={i}
                style={[styles.item, active && styles.activeItem]}
                onPress={() => {
                  router.push(item.route);
                  setOpen(false);
                }}
              >
                <Text style={[styles.text, active && styles.activeText]}>
                  {item.icon} {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* OVERLAY MÓVIL */}
      {isMobile && open && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setOpen(false)}
        />
      )}

      {/* CONTENIDO */}
      <View style={styles.content}>

        {/* HEADER MÓVIL */}
        {isMobile && (
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setOpen(true)}>
              <Text style={styles.hamburger}>☰</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Nospi Admin</Text>
          </View>
        )}

        <Slot />

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    backgroundColor: '#6B0F3A',
    paddingTop: 40,
    paddingHorizontal: 20,
  },

  sidebarMobile: {
    position: 'absolute',
    height: '100%',
    zIndex: 1000,
  },

  logo: {
    color: 'white',
    fontSize: 24,
    marginBottom: 30,
    fontWeight: 'bold',
  },

  item: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
  },

  activeItem: {
    backgroundColor: '#8E1C4F',
  },

  text: {
    color: 'white',
    fontSize: 16,
  },

  activeText: {
    fontWeight: 'bold',
  },

  content: {
    flex: 1,
    padding: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },

  hamburger: {
    fontSize: 24,
    marginRight: 15,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },

  overlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999,
  },
});
