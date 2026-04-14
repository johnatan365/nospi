const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },

  sidebar: {
    width: 240,
    backgroundColor: '#6B0F3A',
    paddingTop: 40,
    paddingHorizontal: 20,

    ...(Platform.OS === 'web' && {
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
    }),
  },

  sidebarMobile: {
    position: 'absolute',
    zIndex: 1000,
    height: '100%',
  },

  logo: {
    color: 'white',
    fontSize: 24,
    marginBottom: 30,
    fontWeight: 'bold',
  },

  menuItem: {
    paddingVertical: 12,
  },

  menuText: {
    color: 'white',
    fontSize: 16,
  },

  content: {
    flex: 1,
    padding: 20,

    ...(Platform.OS === 'web' && {
      marginLeft: 240,
    }),
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: '100%',
    height: '100%',
    zIndex: 999,
  },
});
