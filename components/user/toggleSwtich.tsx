export const ToggleSwitch = ({
    isOn,
    handleToggle,
  }: {
    isOn: boolean;
    handleToggle: () => void;
  }) => {
    return (
      <div
        className={`w-12 h-5 flex items-center bg-gray-300 rounded-full p-1 cursor-pointer ${
          isOn ? "bg-green-500" : "bg-gray-400"
        }`}
        onClick={handleToggle}
      >
        <div
          className={`bg-white w-3 h-3 rounded-full shadow-md transform duration-300 ease-in-out ${
            isOn ? "translate-x-7" : ""
          }`}
        />
      </div>
    );
  };
  