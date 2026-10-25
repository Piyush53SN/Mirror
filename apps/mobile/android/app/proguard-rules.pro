# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# @generated begin expo-build-properties - expo prebuild (DO NOT MODIFY)
# Keep Room database implementations - WorkManager uses Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep @androidx.room.Dao class *
-keep class androidx.room.RoomDatabase { *; }
-dontwarn androidx.room.paging.**

# WorkManager - keep WorkDatabase and its Impl (R8 was stripping WorkDatabase_Impl causing Failed to create instance)
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.ListenableWorker
-keep class * extends androidx.work.InputMerger
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class androidx.work.impl.WorkDatabase { *; }
-keep class androidx.work.impl.* { *; }
-keep class androidx.work.** { *; }

# Startup initializer (InitializationProvider)
-keep class androidx.startup.** { *; }

# Expo TaskManager and BackgroundTask - keep their WorkManager workers
-keep class expo.modules.taskmanager.** { *; }
-keep class expo.modules.backgroundtask.** { *; }
-keep class expo.modules.taskManager.** { *; }
-keep class expo.modules.backgroundTask.** { *; }
-keep class expo.modules.backgroundtask.workmanager.** { *; }

# Expo modules core
-keep class expo.modules.** { *; }

# Keep Mirror native module
-keep class dev.mirror.usagestats.** { *; }

# @generated end expo-build-properties