const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.com$/.test(v);
      },
      message: props => `${props.value} is not a valid email address! Must end with .com`
    }
  },
  password: { type: String, required: true },
  course: { 
    type: String, 
    required: true,
    enum: ['BSCS', 'BSIT'] 
  },
  height: { 
    type: Number, 
    required: true,
    min: [100, 'Height cannot be less than 100 cm'],
    max: [250, 'Height cannot exceed 250 cm']
  },
  weight: { 
    type: Number, 
    required: [true, 'Current weight is required'],
    min: [40, 'Weight cannot be less than 40 kg'],
    max: [500, 'Weight cannot exceed 500 kg']
  },
  initialWeight: { 
    type: Number, 
    required: [true, 'Initial weight is required'],
    min: [40, 'Weight cannot be less than 40 kg'],
    max: [500, 'Weight cannot exceed 500 kg']
  },
  gender: { 
    type: String, 
    required: true,
    enum: ['Male', 'Female', 'Other']
  },
  age: { 
    type: Number, 
    required: true,
    min: [16, 'Age must be at least 16'],
    max: [100, 'Age cannot exceed 100']
  },
  phoneNumber: { 
    type: String, 
    required: true,
    unique: true, 
    validate: {
      validator: function(v) {
        return /^\+639\d{9}$/.test(v); 
      },
      message: props => `${props.value} is not a valid Philippine phone number! Must start with +639`
    }
  },
  profilePicture: { 
    type: String, 
    default: "" 
  },
  isPrivate: {
    type: Boolean,
    default: false,  
    required: true
  },
  totalWeightLifted: {
    type: Number,
    default: 0,
    min: [0, 'Total weight lifted cannot be negative']
  }
});

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.pre('save', function(next) {
  if (this.isNew) {
    this.initialWeight = this.weight;
  }
  next();
});

UserSchema.methods.updateWeight = async function(newWeight) {
  this.weight = newWeight;
  if (!this.initialWeight) {
    this.initialWeight = newWeight;
  }
  return this.save();
};

const User = mongoose.model('User', UserSchema);
module.exports = User;
